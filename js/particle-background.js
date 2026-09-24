(function () {
  'use strict';

  var canvases = document.querySelectorAll('.particle-background');
  if (!canvases.length || !window.requestAnimationFrame) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  Array.prototype.forEach.call(canvases, function (canvas) {
    var ctx = canvas.getContext('2d');
    var header = canvas.parentNode;
    var points = [];
    var pointer = { x: null, y: null, max: 20000 };
    var frameId;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      var rect = header.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var targetCount = rect.width < 768 ? 55 : 110;
      points = [];
      for (var i = 0; i < targetCount; i += 1) {
        points.push({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          vx: Math.random() * 1.2 - 0.6,
          vy: Math.random() * 1.2 - 0.6,
          max: 6000
        });
      }
    }

    function setPointer(event) {
      var rect = header.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    }

    function clearPointer() {
      pointer.x = null;
      pointer.y = null;
    }

    function animate() {
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(79, 192, 141, 0.9)';

      var comparisonPoints = [pointer].concat(points);
      points.forEach(function (point) {
        point.x += point.vx;
        point.y += point.vy;
        if (point.x > width || point.x < 0) point.vx *= -1;
        if (point.y > height || point.y < 0) point.vy *= -1;

        ctx.fillRect(point.x - 0.5, point.y - 0.5, 1, 1);

        for (var i = 0; i < comparisonPoints.length; i += 1) {
          var other = comparisonPoints[i];
          if (point === other || other.x === null || other.y === null) continue;

          var dx = point.x - other.x;
          var dy = point.y - other.y;
          var distance = dx * dx + dy * dy;
          if (distance >= other.max) continue;

          if (other === pointer && distance > other.max / 2) {
            point.x -= dx * 0.03;
            point.y -= dy * 0.03;
          }

          var ratio = (other.max - distance) / other.max;
          ctx.beginPath();
          ctx.lineWidth = ratio / 2;
          ctx.strokeStyle = 'rgba(79, 192, 141,' + (ratio + 0.2) + ')';
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }

        comparisonPoints.splice(comparisonPoints.indexOf(point), 1);
      });

      frameId = window.requestAnimationFrame(animate);
    }

    header.addEventListener('mousemove', setPointer);
    header.addEventListener('mouseleave', clearPointer);
    window.addEventListener('resize', function () {
      window.cancelAnimationFrame(frameId);
      resize();
      animate();
    });

    resize();
    animate();
  });
})();