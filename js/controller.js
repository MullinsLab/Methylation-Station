(function(){
  'use strict';

  angular
    .module('methylation-station')
    .controller('app', app);

  app.$inject = ['$http', '$location', '$scope', '$log'];

  function app($http, $location, $scope, $log) {
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
        if (url.match(/^data:/)) {
          name = "Alignment";
        } else {
          var path = url.split(/\//);
          name = path[ path.length - 1 ];
        }
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

      // Compute new sites
      var sites = this.summarizeGroups
        ? this.alignment.heatmap(this.groupBy).sites
        : this.updateSites();


      // Sort
      var sortKey = this.sortByMethylation
        ? dl.accessor('stats.CpG.percentMethylated')
        : dl.accessor('index');

      var sorter = function(a,b) {
        if (a.isReference) return -1;
        if (b.isReference) return 1;
        return (a.group || b.group ? dl.cmp(a.group, b.group) : null)
            || sortKey(a) - sortKey(b)
            || a.index - b.index;
      };

      // Always sort the underlying array of sequences in-place, as sorting
      // should affect the spreadsheet output as well.
      this.alignment.sequences
        .sort(sorter)
        .forEach((sequence, index) => { sequence.displayIndex = index });

      // Additionally, if we've synthesized sequence records for a group, sort
      // those by the same fields as well.
      if (this.summarizeGroups) {
        let sequences = sites.map((d) => { return d.sequence });

        d3.map(sequences, dl.accessor('id'))
          .values()
          .sort(sorter)
          .forEach((sequence, index) => { sequence.displayIndex = index });
      }


      // Deep clone the data so
      //   a) an Angular update is always forced by referential inequality
      //      without needing deep equality, and
      //   b) the visualization can't change the underlying data.
      this.alignment.filteredSites = angular.copy(sites);
    };

    this.updateSites = function() {
      var data = this.alignment.analysisSites;

      // Filters
      if (this.filter) {
        if (this.filter.hideCpH)
          data = data.filter(function(d){ return d.type !== 'CpH' });

        if (this.filter.hideNovelCpG)
          data = data.filter(function(d){ return d.type !== 'CpG' || d.isInReference });

        if (this.filter.hideMixedSites)
          data = data.filter(function(d){ return d.status !== 'mixed' });
      }

      // Apply sequencing grouping
      var groupByAccessor = this.groupBy
        ? dl.accessor(this.groupBy)
        : () => { return 'All sequences' };

      this.alignment.sequences.forEach((sequence) => {
        sequence.group = groupByAccessor(sequence) + "";
      });

      return data;
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

    // Load any alignment specified by the URL
    if ($location.search().load)
      this.loadURL($location.search().load)
  }

})();
// vim: set ts=2 sw=2 :
