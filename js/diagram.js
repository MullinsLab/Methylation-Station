(function(){
  'use strict';

  angular
    .module('methylation-station')
    .directive('methylationDiagram', directive);


  // The "lollipop"-esque alignment diagram showing methylation status.  This
  // directive is a glue component bridging our Angular app with the Vega
  // runtime.
  //
  directive.$inject = ['debounce', '$timeout', '$log'];

  function directive(debounce, $timeout, $log) {
    return {
      restrict: 'E',
      replace: false,
      scope: {
        data: '<',
        toUrl: '=?',
        rendered: '=?',
        signals: '<?'
      },
      link: function (elementScope, element, attrs) {
        $log.debug("Parsing Vega spec");

        // Parse the Vega spec, create a Vega view attached to our element, and
        // update it with any starting data we have at this point.
        //
        // Everything hinges on a successful parsing of the spec.  If that
        // fails, then nothing else is done.
        //
        vg.parse.spec(MethylationDiagramSpec, function(error, chart) {
          elementScope.$apply(function(scope) {
            if (error) {
              $log.error("Error parsing Vega spec: " + error);
              scope.rendered = false;
              return;
            }

            // Create Vega view for this visualization spec.  The view is
            // stashed on the DOM element for easier debugging.
            var view = element[0].view = chart({
              el: element[0],
              renderer: "svg"
            });

            function replaceViewData(data) {
              $log.debug("Replacing Vega view data for methylation diagram");

              // This ensures that the visualization and view's width/height
              // calculations are done from scratch on the new data by forcing
              // a width update to 0 and back.  Kinda a hack.
              view.width(0).update();
              view.width(element[0].clientWidth);

              view.data("alignment")
                .remove(function(){ return true })
                .insert(data || []);

              view.update();

              scope.rendered = !!data;

              // Another hack around Vega's updating of dynamically-sized viz.
              // In this case, the view sometimes needs to update once more on
              // the next tick/browser repaint, in order for view's own
              // internal width calculations to be correct for new data.  This
              // can be manually triggered by hovering over one of the
              // sequences in the viz.  Instead, just update the view again on
              // the next tick (i.e. a timeout of zero).  Since we know nothing
              // is changing in Angular's scope during our callback, avoid a
              // scope digest with a falsey third param.
              $timeout(() => { view.update() }, 0, false);
            }

            // If we have starting data, render it now.
            if (scope.data)
              replaceViewData(scope.data);

            // When our input data changes, update the Vega view.
            scope.$watch('data', function(newValue, oldValue) {
              if (newValue !== oldValue)
                replaceViewData(newValue);
            });

            // Update the Vega view when our element's width changes
            scope.$watch(
              function(){ return element[0].clientWidth },
              function(newValue, oldValue) {
                if (newValue)
                  view.width(newValue).update();
              }
            );

            // The resize event normally wouldn't trigger an angular scope digest,
            // meaning our watch above wouldn't fire.  We manually ask the scope to
            // update at most every 500ms during a stream of resize events.
            window.addEventListener(
              'resize',
              debounce(500, scope.$apply.bind(scope)),
              false
            );

            if (scope.signals) {
              scope.$watchCollection(
                ()                    => { return scope.signals },
                (signals, oldSignals) => {
                  $log.debug("Updating signals: ", signals);

                  Object.keys(signals).forEach((k) => {
                    view.signal(k, signals[k]);
                  });

                  // Force the view to re-layout the viz if we change the
                  // hideSequenceLabels signal, as the view doesn't otherwise
                  // use the new width available.  This is expensive time-wise,
                  // so we only do it when necessary.
                  if (signals.hideSequenceLabels != oldSignals.hideSequenceLabels) {
                    var w = view.width();
                    view.width(0).update();
                    view.width(w);
                  }

                  view.update();
                }
              );
            }

            // Define a toUrl function exported into our scope which returns a URL
            // pointing to the SVG contents of the Vega view.
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
      }
    };
  }

})();
