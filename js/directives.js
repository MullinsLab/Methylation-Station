(function(){
  'use strict';

  angular
    .module('methylation-station')
    .directive('methylationViz', methylationViz);

  methylationViz.$inject = ['$log'];

  function methylationViz($log) {
    return {
      restrict: 'E',
      replace: false,
      scope: {
        data: '<',
        toUrl: '=',
        rendered: '='
      },
      link: function (elementScope, element, attrs) {
        // When our input data changes, re-render the Vega viz.
        elementScope.$watch('data', function(newValue, oldValue) {
          if (!newValue) {
            elementScope.rendered = false;
            element[0].childNodes.forEach(function(child){
              child.remove()
            });
            return;
          }

          vg.parse.spec(MethylationVizSpec, function(error, chart) {
            elementScope.$apply(function(scope) {
              if (error) {
                $log.error("Error parsing Vega spec: " + error);
                scope.rendered = false;
                return;
              }

              var view = chart({
                el: element[0],
                renderer: "svg"
              });

              view.data("alignment")
                .insert(newValue);

              view.update();
              scope.rendered = true;

              // Update our directive's scope with a new toUrl function closing
              // over the new Vega view object.
              //
              // The XML header is required for viewing the SVG outside of the
              // browser.  It is from:
              //
              //    https://github.com/vega/vega/blob/v2.x/bin/vg2svg
              //
              scope.toUrl = function() {
                var svgHeader =
                  '<?xml version="1.0" encoding="utf-8"?>\n' +
                  '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ' +
                  '"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n';

                var svg  = view.renderer().svg();
                var blob = new Blob([svgHeader + svg], {type: 'image/svg+xml'});
                return window.URL.createObjectURL(blob);
              };
            });
          });
        });
      }
    };
  }

})();
