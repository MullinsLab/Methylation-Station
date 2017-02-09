(function(){
  'use strict';

  angular
    .module('methylation-station')
    .controller('app', app);

  app.$inject = ['$scope', '$log'];

  function app($scope, $log) {
    $log.debug("Attached app controller");

    this.alignment = {};
    this.dataToURL = function() {
      var rows = Alignment.cpgSitesToTable( this.alignment.cpgSites );
      var csv  = d3.csv.formatRows(rows);
      var blob = new Blob([csv], {type: 'text/csv'});
      return window.URL.createObjectURL(blob);
    };

    // Watch for alignment contents to change.  When it does, parse the new
    // alignment and retabulate the methylation data.
    $scope.$watch(
      angular.bind(this, function(){ return this.alignment.fasta }),
      angular.bind(this, updateAlignment)
    );

    function updateAlignment(newFasta, oldFasta) {
      // Reset state to just the new name and contents
      this.alignment = {
        name:  this.alignment.name,
        fasta: newFasta
      };

      if (!newFasta)
        return;

      try {
        $log.debug("Parsing FASTA", this.alignment.name);
        var newAlignment = Alignment.parse(newFasta);

        $log.debug("Tallying CpG sites");
        this.alignment.cpgSites = Alignment.cpgSites(newAlignment);
      }
      catch (e) {
        this.alignment.error = "Couldn't parse FASTA: " + e;
        $log.error(e);
        return;
      }
    }
  }

})();
// vim: set ts=2 sw=2 :
