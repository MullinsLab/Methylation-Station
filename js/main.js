(function(){
  'use strict';

  // Overall app-level module which pulls in other things and sets up defaults.
  angular
    .module('methylation-station', [
      'fileModel'
    ])
    .config(configure)
    .run(init);

  configure.$inject = ['$compileProvider', '$locationProvider', '$anchorScrollProvider'];

  function configure($compileProvider, $locationProvider, $anchorScrollProvider) {
    // Faster DOM rendering without maintaining debug bookkeeping
    $compileProvider.debugInfoEnabled(false);

    // Allow blob: URLs for downloads
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|blob):/);

    // Configure $location and $anchorScroll to stay out of the way of normal
    // URL and HTML anchors.  We use them only in a very limited fashion, not
    // as an app-wide link/routing mechanism.
    $locationProvider.html5Mode({
      enabled: true,
      requireBase: false,
      rewriteLinks: false
    });
    $anchorScrollProvider.disableAutoScrolling();
  }

  init.$inject = ['$log'];

  function init($log) {
    $log.debug("Starting up Methylation Station!");
  }

})();
// vim: set ts=2 sw=2 :
