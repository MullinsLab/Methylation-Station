(function(){
  'use strict';

  angular
    .module('methylation-station')
    .controller('app', app);

  app.$inject = ['$scope', '$log'];

  function app($scope, $log) {
    $log.debug("Attached app controller");

    this.alignment = null;
    this.dataToURL = function() {
      var rows = this.alignment.asTable();
      var csv  = d3.csv.formatRows(rows);
      var blob = new Blob([csv], {type: 'text/csv'});
      return window.URL.createObjectURL(blob);
    };

    // Watch for alignment contents to change.  When it does, parse the new
    // alignment and retabulate the methylation data.
    $scope.$watch(
      angular.bind(this, function(){ return this.fasta ? this.fasta.text : null }),
      angular.bind(this, updateAlignment)
    );

    function updateAlignment(newFasta, oldFasta) {
      // Reset state
      this.alignment = null;
      this.error     = null;

      if (!newFasta)
        return;

      try {
        $log.debug("Parsing FASTA", this.fasta.name);
        this.alignment = new Alignment(newFasta, this.fasta.name);
      }
      catch (e) {
        this.error = "Couldn't parse FASTA: " + e;
        $log.error(e);
        return;
      }
    }
  }

})();
// vim: set ts=2 sw=2 :
