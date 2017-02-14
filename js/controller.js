(function(){
  'use strict';

  angular
    .module('methylation-station')
    .controller('app', app);

  app.$inject = ['$http', '$scope', '$log'];

  function app($http, $scope, $log) {
    $log.debug("Attached app controller");

    this.alignment = null;

    // Spreadsheet download
    this.tableToURL = function() {
      var rows = this.alignment.asTable();
      var csv  = d3.csv.formatRows(rows);
      var blob = new Blob([csv], {type: 'text/csv'});
      return window.URL.createObjectURL(blob);
    };

    // Raw data download
    this.dataToURL = function() {
      var rows = [["sequence_index", "sequence_id", "type", "site", "status"]].concat(
        this.alignment.analysisSites.map(function(d){
          return [d.sequence.index, d.sequence.id, d.type, d.site, d.status];
        })
      );
      var csv  = d3.csv.formatRows(rows);
      var blob = new Blob([csv], {type: 'text/csv'});
      return window.URL.createObjectURL(blob);
    };

    // Load data and plot it
    this.loadURL = function(url, name) {
      if (!name) {
        var path = url.split(/\//);
        name = path[ path.length - 1 ];
      }

      $http.get(url).then(
        angular.bind(this, function(response) {
          this.fasta = {
            text: response.data,
            name: name
          };
        })
      );
    };

    // Sync our filtered and sorted UI data from the primary
    // alignment analysis data
    //
    this.update = function() {
      if (!this.alignment)
        return;

      var data = this.alignment.analysisSites;

      // Filters
      if (this.filter) {
        if (this.filter.hideCpH)
          data = data.filter(function(d){ return d.type !== 'CpH' });

        if (this.filter.hideNovelCpG)
          data = data.filter(function(d){ return d.type !== 'CpG' || d.isInReference });
      }

      // Sort - Note that the underlying array of sequences is modified
      // in-place, as sorting should affect the spreadsheet output as well.
      var sortKey = this.sortByMethylation
        ? dl.accessor('stats.CpG.percentMethylated')
        : dl.accessor('index');

      this.alignment.sequences
        .sort(function(a,b) {
          if (a.index === 0) return -1;
          if (b.index === 0) return 1;
          return sortKey(a) - sortKey(b)
              || a.index - b.index;
        })
        .forEach(function(sequence, index) {
          sequence.displayIndex = index;
        });

      // Deep clone the data so
      //   a) an Angular update is always forced by referential inequality
      //      without needing deep equality, and
      //   b) the visualization can't change the underlying data.
      this.alignment.filteredSites = angular.copy(data);
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

      if (!newFasta) {
        this.update();
        return;
      }

      try {
        $log.debug("Parsing FASTA", this.fasta.name);
        this.alignment = new Alignment(newFasta, this.fasta.name);
      }
      catch (e) {
        this.error = "Couldn't parse FASTA: " + e;
        $log.error(e);
        return;
      }
      this.update();
    }
  }

})();
// vim: set ts=2 sw=2 :
