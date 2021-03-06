"use strict";

exports.__esModule = true;
exports.default = void 0;

var _immutable = _interopRequireDefault(require("immutable"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _react = _interopRequireDefault(require("react"));

var _reactMapGl = require("react-map-gl");

var _geo = require("./utils/geo");

var _roundDecimal = _interopRequireDefault(require("./utils/roundDecimal"));

var _luminanceFromRGB = _interopRequireDefault(require("./utils/luminanceFromRGB"));

require("mapbox-gl/dist/mapbox-gl.css");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/* eslint-disable react/require-default-props */
const propTypes = {
  aggregation: _propTypes.default.string,
  compositeOperation: _propTypes.default.string,
  dotRadius: _propTypes.default.number,
  lngLatAccessor: _propTypes.default.func,
  locations: _propTypes.default.instanceOf(_immutable.default.List).isRequired,
  pointRadiusUnit: _propTypes.default.string,
  renderWhileDragging: _propTypes.default.bool,
  rgb: _propTypes.default.arrayOf(_propTypes.default.oneOfType([_propTypes.default.string, _propTypes.default.number])),
  zoom: _propTypes.default.number
};
const defaultProps = {
  // Same as browser default.
  compositeOperation: 'source-over',
  dotRadius: 4,
  lngLatAccessor: location => [location.get(0), location.get(1)],
  renderWhileDragging: true
};

const computeClusterLabel = (properties, aggregation) => {
  const count = properties.get('point_count');

  if (!aggregation) {
    return count;
  }

  if (aggregation === 'sum' || aggregation === 'min' || aggregation === 'max') {
    return properties.get(aggregation);
  }

  const sum = properties.get('sum');
  const mean = sum / count;

  if (aggregation === 'mean') {
    return Math.round(100 * mean) / 100;
  }

  const squaredSum = properties.get('squaredSum');
  const variance = squaredSum / count - (sum / count) ** 2;

  if (aggregation === 'var') {
    return Math.round(100 * variance) / 100;
  }

  if (aggregation === 'stdev') {
    return Math.round(100 * Math.sqrt(variance)) / 100;
  } // fallback to point_count, this really shouldn't happen


  return count;
};

class ScatterPlotGlowOverlay extends _react.default.PureComponent {
  constructor(props) {
    super(props);
    this.redraw = this.redraw.bind(this);
  }

  drawText(ctx, pixel, options = {}) {
    const IS_DARK_THRESHOLD = 110;
    const {
      fontHeight = 0,
      label = '',
      radius = 0,
      rgb = [0, 0, 0],
      shadow = false
    } = options;
    const maxWidth = radius * 1.8;
    const luminance = (0, _luminanceFromRGB.default)(rgb[1], rgb[2], rgb[3]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = luminance <= IS_DARK_THRESHOLD ? 'white' : 'black';
    ctx.font = `${fontHeight}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (shadow) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = luminance <= IS_DARK_THRESHOLD ? 'black' : '';
    }

    const textWidth = ctx.measureText(label).width;

    if (textWidth > maxWidth) {
      const scale = fontHeight / textWidth;
      ctx.font = `${scale * maxWidth}px sans-serif`;
    }

    const {
      compositeOperation
    } = this.props;
    ctx.fillText(label, pixel[0], pixel[1]);
    ctx.globalCompositeOperation = compositeOperation;
    ctx.shadowBlur = 0;
    ctx.shadowColor = '';
  } // Modified: https://github.com/uber/react-map-gl/blob/master/overlays/scatterplot.react.js


  redraw({
    width,
    height,
    ctx,
    isDragging,
    project
  }) {
    const {
      aggregation,
      compositeOperation,
      dotRadius,
      lngLatAccessor,
      locations,
      pointRadiusUnit,
      renderWhileDragging,
      rgb,
      zoom
    } = this.props;
    const radius = dotRadius;
    const clusterLabelMap = [];
    locations.forEach((location, i) => {
      if (location.get('properties').get('cluster')) {
        clusterLabelMap[i] = computeClusterLabel(location.get('properties'), aggregation);
      }
    }, this);
    const maxLabel = Math.max(...clusterLabelMap.filter(v => !Number.isNaN(v)));
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = compositeOperation;

    if ((renderWhileDragging || !isDragging) && locations) {
      locations.forEach(function _forEach(location, i) {
        const pixel = project(lngLatAccessor(location));
        const pixelRounded = [(0, _roundDecimal.default)(pixel[0], 1), (0, _roundDecimal.default)(pixel[1], 1)];

        if (pixelRounded[0] + radius >= 0 && pixelRounded[0] - radius < width && pixelRounded[1] + radius >= 0 && pixelRounded[1] - radius < height) {
          ctx.beginPath();

          if (location.get('properties').get('cluster')) {
            let clusterLabel = clusterLabelMap[i];
            const scaledRadius = (0, _roundDecimal.default)((clusterLabel / maxLabel) ** 0.5 * radius, 1);
            const fontHeight = (0, _roundDecimal.default)(scaledRadius * 0.5, 1);
            const [x, y] = pixelRounded;
            const gradient = ctx.createRadialGradient(x, y, scaledRadius, x, y, 0);
            gradient.addColorStop(1, `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.8)`);
            gradient.addColorStop(0, `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0)`);
            ctx.arc(pixelRounded[0], pixelRounded[1], scaledRadius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            if (Number.isFinite(parseFloat(clusterLabel))) {
              if (clusterLabel >= 10000) {
                clusterLabel = `${Math.round(clusterLabel / 1000)}k`;
              } else if (clusterLabel >= 1000) {
                clusterLabel = `${Math.round(clusterLabel / 100) / 10}k`;
              }

              this.drawText(ctx, pixelRounded, {
                fontHeight,
                label: clusterLabel,
                radius: scaledRadius,
                rgb,
                shadow: true
              });
            }
          } else {
            const defaultRadius = radius / 6;
            const radiusProperty = location.get('properties').get('radius');
            const pointMetric = location.get('properties').get('metric');
            let pointRadius = radiusProperty === null ? defaultRadius : radiusProperty;
            let pointLabel;

            if (radiusProperty !== null) {
              const pointLatitude = lngLatAccessor(location)[1];

              if (pointRadiusUnit === 'Kilometers') {
                pointLabel = `${(0, _roundDecimal.default)(pointRadius, 2)}km`;
                pointRadius = (0, _geo.kmToPixels)(pointRadius, pointLatitude, zoom);
              } else if (pointRadiusUnit === 'Miles') {
                pointLabel = `${(0, _roundDecimal.default)(pointRadius, 2)}mi`;
                pointRadius = (0, _geo.kmToPixels)(pointRadius * _geo.MILES_PER_KM, pointLatitude, zoom);
              }
            }

            if (pointMetric !== null) {
              pointLabel = Number.isFinite(parseFloat(pointMetric)) ? (0, _roundDecimal.default)(pointMetric, 2) : pointMetric;
            } // Fall back to default points if pointRadius wasn't a numerical column


            if (!pointRadius) {
              pointRadius = defaultRadius;
            }

            ctx.arc(pixelRounded[0], pixelRounded[1], (0, _roundDecimal.default)(pointRadius, 1), 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
            ctx.fill();

            if (pointLabel !== undefined) {
              this.drawText(ctx, pixelRounded, {
                fontHeight: (0, _roundDecimal.default)(pointRadius, 1),
                label: pointLabel,
                radius: pointRadius,
                rgb,
                shadow: false
              });
            }
          }
        }
      }, this);
    }
  }

  render() {
    return /*#__PURE__*/_react.default.createElement(_reactMapGl.CanvasOverlay, {
      redraw: this.redraw
    });
  }

}

ScatterPlotGlowOverlay.propTypes = propTypes;
ScatterPlotGlowOverlay.defaultProps = defaultProps;
var _default = ScatterPlotGlowOverlay;
exports.default = _default;