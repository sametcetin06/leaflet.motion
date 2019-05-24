/**
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Igor Vladyka <igor.vladyka@gmail.com> (https://github.com/Igor-Vladyka/leaflet.motion)
**/

L.Motion = L.Motion || {
	Event: {
			Started:"motion-started",
			Paused: "motion-paused",
			Resumed: "motion-resumed",
			Section: "motion-section",
			Ended: "motion-ended"
		}
	};

L.motion = L.motion || {};
L.Motion.Animate = {
	options: {
		pane: "polymotionPane",
		attribution: "Leaflet.Motion © " + (new Date()).getFullYear() + " Igor Vladyka"
	},

	motionOptions: {
		auto: false,
		easing: function(x){ return x; }, // linear
		speed: 0, // KM/H
		duration: 0 // ms
	},

	markerOptions: undefined,

	initialize: function (latlngs, options, motionOptions, markerOptions) {
		L.Util.setOptions(this, options);
		this.motionOptions = L.Util.extend({}, this.motionOptions, motionOptions || {});
		this.markerOptions = L.Util.extend({}, markerOptions || {});

		this._bounds = L.latLngBounds();
		this._linePoints = this._convertLatLngs(latlngs);
		if (!L.LineUtil.isFlat(this._linePoints)) {
			this._linePoints = this._linePoints[0];
		}

		this._latlngs = [];
		L.Util.stamp(this); // Enforce proper animation order;
	},

	addLatLng: function(latLng, ring) {
		latLng = L.Motion.Utils.toLatLng(latLng);
		this._linePoints.push(latLng);
		if (this._latlngs.length) {
			this._latlngs.push(latLng);
		}
		return this;
	},

	/**
        @param {Map} map the Leaflet Map
    */
	beforeAdd: function (map) {
		if (!map.getPane(this.options.pane)) {
			map.createPane(this.options.pane).style.zIndex = 599;
		}

		this._renderer = map.getRenderer(this);
	},

	/**
        @param {Map} map the Leaflet Map
		@return {MotionObject} this
    */
    onAdd: function (map) {
		this._renderer._initPath(this);
		this._reset();
		this._renderer._addPath(this);

		if (this.motionOptions.auto) {
			this.motionStart();
		}

        return this;
    },

	/**
        @param {Map} map the Leaflet Map
    */
	onRemove: function (map) {
		this.motionStop();
		if (this.__marker) {
			map.removeLayer(this.__marker);
		}

		this._renderer._removePath(this);
	},

	/**
        @param {DateTime} startTime time from start animation
    */
    _motion: function (startTime) {
		var ellapsedTime = (new Date()).getTime() - startTime;
        var durationRatio = 1; // 0 - 1
		if (this.motionOptions.duration) {
			durationRatio = ellapsedTime / this.motionOptions.duration;
		}

		if (durationRatio < 1) {
			durationRatio = this.motionOptions.easing(durationRatio, ellapsedTime, 0, 1, this.motionOptions.duration);
			var nextPoint = L.Motion.Utils.interpolateOnLine(this._map, this._linePoints, durationRatio);

			L.Polyline.prototype.addLatLng.call(this, nextPoint.latLng);
			this._drawMarker(nextPoint.latLng);

			this.__ellapsedTime = ellapsedTime;
			this.animation = L.Util.requestAnimFrame(function(){
				this._motion(startTime);
			}, this);
		} else {
			this.motionStop();
		}
    },

	/**
		Draws marker according to line position
        @param {LatLng} nextPoint next animation point
    */
	_drawMarker: function (nextPoint) {
		if (this.markerOptions) {
			if (!this.__marker) {
				this.__marker = L.marker(nextPoint, this.markerOptions);
				this.__marker.addTo(this._map);
				this.__marker.addEventParent(this);
			} else {
				var m = this.__marker;
				var prevPoint = m.getLatLng();
				var angle = Math.atan2(nextPoint.lat - prevPoint.lat, nextPoint.lng - prevPoint.lng) * 180 / Math.PI;
				if (angle < 0) {
					angle += 360;
				}

				if (m._icon.children.length) {
					var needToRotateMarker = m._icon.children[0].getAttribute("motion-base");

					if (needToRotateMarker) {
						var motionMarkerOnLine = 0;
						if (needToRotateMarker && !isNaN(+needToRotateMarker)) {
							motionMarkerOnLine = +needToRotateMarker;
						}

						m._icon.children[0].style.transform = "rotate(-" + Math.round(angle + motionMarkerOnLine) +"deg)";
					}
				}

				m.setLatLng(nextPoint);
			}
		}
	},

	/**
        Removes marker from the map
    */
	_removeMarker: function () {
		if (this.markerOptions && this.markerOptions.removeOnEnd && this.__marker) {
			this.__marker.remove();
			delete this.__marker;
		}
	},

	/**
        Starts animation of current object
    */
	motionStart: function () {
		if (this._map && !this.animation) {
			//this._linePoints = this.getLatLngs();
			if (!this.motionOptions.duration) {
				if (this.motionOptions.speed) {
					this.motionOptions.duration = L.Motion.Utils.getDuration(this._linePoints, this.motionOptions.speed);
				} else {
					this.motionOptions.duration = 0;
				}
			}
			this.setLatLngs([]);
	        this._motion((new Date).getTime());
			this.fire(L.Motion.Event.Started, {layer: this}, false);
		}

		return this;
    },

	/**
        Stops animation of current object
        @param {LatLng[]} points full object points collection or empty collection for cleanup
    */
    motionStop: function () {
		this.motionPause();
		this.setLatLngs(this._linePoints);
		this.__ellapsedTime = null;
		this._removeMarker();
		this.fire(L.Motion.Event.Ended, {layer: this}, false);

		return this;
    },

	/**
        Pauses animation of current object
    */
	motionPause: function () {
		if (this.animation) {
			L.Util.cancelAnimFrame(this.animation);
			this.animation = null;
			this.fire(L.Motion.Event.Paused, {layer: this}, false);
		}

		return this;
	},

	/**
        Resume animation of current object
    */
	motionResume: function () {
		if (!this.animation && this.__ellapsedTime) {
			if (!this.motionOptions.duration) {
				if (this.motionOptions.speed) {
					this.motionOptions.duration = L.Motion.Utils.getDuration(this._linePoints, this.motionOptions.speed);
				} else {
					this.motionOptions.duration = 0;
				}
			}
			this._motion((new Date).getTime() - (this.__ellapsedTime));
			this.fire(L.Motion.Event.Resumed, {layer: this}, false);
		}

		return this;
	},

	/**
        Toggles animation of current object; Start/Pause/Resume;
    */
	motionToggle: function () {
		if (this.animation) {
			if (this.__ellapsedTime) {
				this.motionPause();
			}
		} else {
			if (this.__ellapsedTime) {
				this.motionResume();
			} else {
				this.motionStart();
			}
		}

		return this;
	},

	motionDuration: function (duration) {
		this.motionOptions.duration = duration || 0;
		return this;
	},

	motionSpeed: function (speed) {
		this.motionOptions.speed = speed || 0;
		return this;
	}
}
L.Motion.Polyline = L.Polyline.extend(L.Motion.Animate);

L.motion.polyline = function(latlngs, options, motionOptions, markerOptions){
  return new L.Motion.Polyline(latlngs, options, motionOptions, markerOptions);
};



L.Motion.Group = L.FeatureGroup.extend ({
	options: {
		pane: L.Motion.Animate.options.pane,
		attribution: L.Motion.Animate.options.attribution,
	},

	/**
		Starts all motions in current group;
	*/
	motionStart: function () {
		this.invoke("motionStart");
		this.fire(L.Motion.Event.Started, {layer: this}, false);
		return this;
	},

	/**
		Stops all motions in current group;
	*/
	motionStop: function () {
		this.invoke("motionStop");
		this.fire(L.Motion.Event.Ended, {layer: this}, false);
		return this;
	},

	/**
		Pauses all motions in current group;
	*/
	motionPause: function () {
		this.invoke("motionPause");
		this.fire(L.Motion.Event.Paused, {layer: this}, false);
		return this;
	},

	/**
		Reset all motions in current group;
	*/
	motionResume: function () {
		this.invoke("motionResume");
		this.fire(L.Motion.Event.Resumed, {layer: this}, false);
		return this;
	},

	/**
		Reset all motions in current group;
	*/
	motionToggle: function () {
		this.invoke("motionToggle");
		return this;
	}
});

L.motion.group = function(motions, options){
    return new L.Motion.Group(motions, options);
};


L.Motion.Polygon = L.Polygon.extend(L.Motion.Animate);

L.motion.polygon = function(latlngs, options, motionOptions, markerOptions){
    return new L.Motion.Polygon(latlngs, options, motionOptions, markerOptions);
};



L.Motion.Seq = L.Motion.Group.extend ({
	_activeLayer: null,

	/**
		Start first motion in current group;
	*/
	motionStart: function() {
		var layer = this.getFirstLayer();
		if (layer) {
			this.__prepareStart();
			layer.motionStart();
			this.fire(L.Motion.Event.Started, {layer: this}, false);
		}

		return this;
	},

	/**
		Stops all motions in current group;
	*/
	motionStop: function() {
		this.invoke("motionStop");
		this._activeLayer = null;
		this.fire(L.Motion.Event.Ended, {layer: this}, false);

		return this;
	},

	/**
		Pause current motion in current group;
	*/
	motionPause: function() {
		if (this._activeLayer) {
			this._activeLayer.motionPause();
			this.fire(L.Motion.Event.Paused, {layer: this}, false);
		}

		return this;
	},

	/**
		Resume last motion in current group;
	*/
	motionResume: function() {
		if (this._activeLayer) {
			this._activeLayer.motionResume();
			this.fire(L.Motion.Event.Resumed, {layer: this}, false);
		}

		return this;
	},

	/**
		Reset all motions in current group;
	*/
	motionToggle: function () {
		if (this._activeLayer) {
			this.motionPause();
		} else {
			this.motionResume();
		}

		return this;
	},

	getFirstLayer: function() {
		var allLayers = this.getLayers();
		return allLayers.length ? allLayers[0] : null;
	},

	__prepareStart: function() {
		var self = this;
		this.getLayers().forEach(function(l){
			l.off(L.Motion.Event.Ended, self.__clearActiveLayer__, self);
			l.on(L.Motion.Event.Ended, self.__clearActiveLayer__, self);

			l.off(L.Motion.Event.Started, self.__putActiveLayer__, self);
			l.on(L.Motion.Event.Started, self.__putActiveLayer__, self);
		});
	},

	__clearActiveLayer__: function (e) {
		this._activeLayer = null;
		var layers = this.getLayers();
		var currentId = e.layer._leaflet_id;
		var currentObject = layers.filter(function(f){ return f._leaflet_id == currentId })[0];
		var nextIndex = layers.indexOf(currentObject) + 1;
		if (layers.length > nextIndex) {
			layers[nextIndex].motionStart();
		} else {
			this.fire(L.Motion.Event.Ended, {layer: this}, false);
		}
	},

	__putActiveLayer__: function (e) {
		this._activeLayer = e.layer;
		this.fire(L.Motion.Event.Section, {layer: this._activeLayer}, false);
	}
});

L.motion.seq = function(motion, options){
    return new L.Motion.Seq(motion, options);
};


L.Motion.Utils = {
  /**
   Returns the coordinate of the point located on a line at the specified ratio of the line length.
   @param {L.Map} map Leaflet map to be used for this method
   @param {Array<L.LatLng>|L.PolyLine} latlngs Set of geographical points
   @param {Number} ratio the length ratio, expressed as a decimal between 0 and 1, inclusive
   @returns {Object} an object with latLng ({LatLng}) and predecessor ({Number}), the index of the preceding vertex in the Polyline
   (-1 if the interpolated point is the first vertex)
   */
  interpolateOnLine: function (map, latLngs, ratio) {
    latLngs = (latLngs instanceof L.Polyline) ? latLngs.getLatLngs() : latLngs;
    var n = latLngs.length;
    if (n < 2) {
      return null;
    }

    // ensure the ratio is between 0 and 1;
    ratio = Math.max(Math.min(ratio, 1), 0);

    if (ratio === 0) {
      return {
        latLng: latLngs[0] instanceof L.LatLng ? latLngs[0] : L.latLng(latLngs[0]),
        predecessor: -1
      };
    }
    if (ratio == 1) {
      return {
        latLng: latLngs[latLngs.length -1] instanceof L.LatLng ? latLngs[latLngs.length -1] : L.latLng(latLngs[latLngs.length -1]),
        predecessor: latLngs.length - 2
      };
    }

    // project the LatLngs as Points,
    // and compute total planar length of the line at max precision
    var maxzoom = map.getMaxZoom();
    if (maxzoom === Infinity)
      maxzoom = map.getZoom();
    var pts = [];
    var lineLength = 0;
    for(var i = 0; i < n; i++) {
      pts[i] = map.project(latLngs[i], maxzoom);
      if(i > 0)
        lineLength += pts[i-1].distanceTo(pts[i]);
    }

    var ratioDist = lineLength * ratio;

    // follow the line segments [ab], adding lengths,
    // until we find the segment where the points should lie on
    var cumulativeDistanceToA = 0, cumulativeDistanceToB = 0;
    for (var i = 0; cumulativeDistanceToB < ratioDist; i++) {
      var pointA = pts[i], pointB = pts[i+1];

      cumulativeDistanceToA = cumulativeDistanceToB;
      cumulativeDistanceToB += pointA.distanceTo(pointB);
    }

    if (pointA == undefined && pointB == undefined) { // Happens when line has no length
      var pointA = pts[0], pointB = pts[1], i = 1;
    }

    // compute the ratio relative to the segment [ab]
    var segmentRatio = ((cumulativeDistanceToB - cumulativeDistanceToA) !== 0) ? ((ratioDist - cumulativeDistanceToA) / (cumulativeDistanceToB - cumulativeDistanceToA)) : 0;
    var interpolatedPoint = this.interpolateOnPointSegment(pointA, pointB, segmentRatio);
    return {
      latLng: map.unproject(interpolatedPoint, maxzoom),
      predecessor: i-1
    };
  },

  /**
   Returns the Point located on a segment at the specified ratio of the segment length.
   @param {L.Point} pA coordinates of point A
   @param {L.Point} pB coordinates of point B
   @param {Number} the length ratio, expressed as a decimal between 0 and 1, inclusive.
   @returns {L.Point} the interpolated point.
   */
  interpolateOnPointSegment: function (pA, pB, ratio) {
    return L.point(
      (pA.x * (1 - ratio)) + (ratio * pB.x),
      (pA.y * (1 - ratio)) + (ratio * pB.y)
    );
  },

  /**
   @param {LatLng[]} linePoints of coordinates
   @return {Number} distance in meter
   */
  distance: function(linePoints){
    var distanceInMeter = 0;
    for (var i = 1; i < linePoints.length; i++) {
      distanceInMeter += linePoints[i].distanceTo(linePoints[i - 1]);
    }

    return distanceInMeter;
  },

  /**
   @param {LatLng[]} collection of coordinates
   @param {Number} speed in KM/H
   @return {Number} duration in ms
   */
  getDuration: function (collection, speed) {
    var distance = L.Motion.Utils.distance(collection.map(function(m){ return L.Motion.Utils.toLatLng(m); })); // in meters;
    return distance/(speed/3600); // m / (km/h * 1000 => m/h / (60 * 60)) => m / k/s (m/s * 1000) => 1000 * m / m/s => ms;
  },

  toLatLng: function(a, b, c) {
    if (a instanceof L.LatLng) {
      return a;
    }
    if (L.Util.isArray(a) && typeof a[0] !== 'object') {
      if (a.length === 3) {
        return L.latLng(a[0], a[1], a[2]);
      }
      if (a.length === 2) {
        return L.latLng(a[0], a[1]);
      }
      return null;
    }
    if (a === undefined || a === null) {
      return a;
    }
    if (typeof a === 'object' && 'lat' in a) {
      return L.latLng(a.lat, 'lng' in a ? a.lng : a.lon, a.alt);
    }
    if (b === undefined) {
      return null;
    }
    return L.latLng(a, b, c);
  }
};
L.Motion.Ease = {
  linear: function( x ) {
    return x;
  },
  swing: function( x ) {
    return 0.5 - Math.cos( x * Math.PI ) / 2;
  },
  easeInQuad: function (x, t, b, c, d) {
    return c*(t/=d)*t + b;
  },
  easeOutQuad: function (x, t, b, c, d) {
    return -c *(t/=d)*(t-2) + b;
  },
  easeInOutQuad: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t + b;
    return -c/2 * ((--t)*(t-2) - 1) + b;
  },
  easeInCubic: function (x, t, b, c, d) {
    return c*(t/=d)*t*t + b;
  },
  easeOutCubic: function (x, t, b, c, d) {
    return c*((t=t/d-1)*t*t + 1) + b;
  },
  easeInOutCubic: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t + b;
    return c/2*((t-=2)*t*t + 2) + b;
  },
  easeInQuart: function (x, t, b, c, d) {
    return c*(t/=d)*t*t*t + b;
  },
  easeOutQuart: function (x, t, b, c, d) {
    return -c * ((t=t/d-1)*t*t*t - 1) + b;
  },
  easeInOutQuart: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
    return -c/2 * ((t-=2)*t*t*t - 2) + b;
  },
  easeInQuint: function (x, t, b, c, d) {
    return c*(t/=d)*t*t*t*t + b;
  },
  easeOutQuint: function (x, t, b, c, d) {
    return c*((t=t/d-1)*t*t*t*t + 1) + b;
  },
  easeInOutQuint: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
    return c/2*((t-=2)*t*t*t*t + 2) + b;
  },
  easeInSine: function (x, t, b, c, d) {
    return -c * Math.cos(t/d * (Math.PI/2)) + c + b;
  },
  easeOutSine: function (x, t, b, c, d) {
    return c * Math.sin(t/d * (Math.PI/2)) + b;
  },
  easeInOutSine: function (x, t, b, c, d) {
    return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
  },
  easeInExpo: function (x, t, b, c, d) {
    return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
  },
  easeOutExpo: function (x, t, b, c, d) {
    return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
  },
  easeInOutExpo: function (x, t, b, c, d) {
    if (t==0) return b;
    if (t==d) return b+c;
    if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
    return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
  },
  easeInCirc: function (x, t, b, c, d) {
    return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
  },
  easeOutCirc: function (x, t, b, c, d) {
    return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
  },
  easeInOutCirc: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
    return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
  },
  easeInElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
  },
  easeOutElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
  },
  easeInOutElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
    return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
  },
  easeInBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    return c*(t/=d)*t*((s+1)*t - s) + b;
  },
  easeOutBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
  },
  easeInOutBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
    return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
  },
  easeInBounce: function (x, t, b, c, d) {
    return c - L.Motion.Ease.easeOutBounce (x, d-t, 0, c, d) + b;
  },
  easeOutBounce: function (x, t, b, c, d) {
    if ((t/=d) < (1/2.75)) {
      return c*(7.5625*t*t) + b;
    } else if (t < (2/2.75)) {
      return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
    } else if (t < (2.5/2.75)) {
      return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
    } else {
      return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
    }
  },
  easeInOutBounce: function (x, t, b, c, d) {
    if (t < d/2) return L.Motion.Ease.easeInBounce (x, t*2, 0, c, d) * .5 + b;
    return L.Motion.Ease.easeOutBounce (x, t*2-d, 0, c, d) * .5 + c*.5 + b;
  }
};
