(function(){
  'use strict';

  angular
    .module('methylation-station')
    .directive('methylationDiagram', methylationDiagram);

  methylationDiagram.$inject = ['debounce', '$log'];

  function methylationDiagram(debounce, $log) {
    return {
      restrict: 'E',
      replace: false,
      scope: {
        data: '<',
        toUrl: '=',
        rendered: '='
      },
      link: function (elementScope, element, attrs) {
        // When our input data changes, re-render the Vega spec.
        elementScope.$watch('data', function(newValue, oldValue) {
          if (!newValue) {
            elementScope.rendered = false;
            element[0].childNodes.forEach(function(child){
              child.remove()
            });
            return;
          }

          vg.parse.spec(MethylationDiagramSpec, function(error, chart) {
            elementScope.$apply(function(scope) {
              if (error) {
                $log.error("Error parsing Vega spec: " + error);
                scope.rendered = false;
                return;
              }

              var view = element[0].view = chart({
                el: element[0],
                renderer: "svg"
              });

              view.data("alignment")
                .insert(newValue);

              view.width(element[0].clientWidth);

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
                var defs = document.querySelector("svg#gradients defs").outerHTML;

                // Embed external definitions for gradient fills at the end of
                // the document.  Yes, this is doing string manip on XML.
                svg = svg.replace(/(?=<\/svg>)/i, defs);

                var blob = new Blob([svgHeader + svg], {type: 'image/svg+xml'});
                return window.URL.createObjectURL(blob);
              };
            });
          });
        });

        // Update the Vega view when our element's width changes
        elementScope.$watch(
          function(){ return element[0].clientWidth },
          function(newValue, oldValue) {
            if (element[0] && element[0].view && newValue)
              element[0].view.width(newValue).update();
          }
        );

        // The resize event normally wouldn't trigger an angular scope digest,
        // meaning our watch above wouldn't fire.  We manually ask the scope to
        // update at most every 500ms during a stream of resize events.
        window.addEventListener(
          'resize',
          debounce(500, elementScope.$apply.bind(elementScope)),
          false
        );
      }
    };
  }

})();
