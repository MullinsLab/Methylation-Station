(function(){
  'use strict';

  angular
    .module('methylation-station')
    .directive('methylationHeatmap', directive)
    .controller('HeatmapController', controller);


  // A heatmap of methylation level across the alignment, with sequences
  // optionally grouped by some tag value.  This is rendered entirely natively
  // in Angular, HTML, and SVG.
  //
  directive.$inject = [];

  function directive() {
    return {
      restrict: 'E',
      replace: false,
      templateUrl: 'heatmap.html',
      controller: 'HeatmapController',
      controllerAs: 'heatmap',
      bindToController: true,
      scope: {
        alignment: '<',
        groupBy: '=?',
        groupByFields: '=?',
        groups: '=?',
        orderBy: '=?'
      }
    }
  }

  controller.$inject = ['$scope', '$log'];

  function controller($scope, $log) {
    $log.debug("Attached heatmap controller");

    // Setup our color scale
    var heatmapColors = ["#FF7128", "#FFEB84", "#63BE7B"];

    this.colorScale = d3.scale.linear()
      .domain(d3.range(0, 1, 1 / (heatmapColors.length - 1)).concat(1))
      .range(heatmapColors)
      .clamp(true);


    // Watch for alignment and grouping field to change.  When either does,
    // reaggregrate the methylation data.
    function update() {
      this.groups = summarize(this.alignment, this.groupBy);

      // Roll up the set of tags available on sequences in this alignment,
      // which are the keys we can group on
      if (this.alignment) {
        this.groupByFields =
          dl.unique(
            this.alignment.sequences
              .map(dl.accessor("tags"))
              .map(Object.keys)
              .reduce(function(a,b){ return a.concat(b) })
          ).map(function(d){
            return {
              name: d,
              path: "sequence.tags." + d
            }
          });
      } else {
        this.groupByFields = [];
      }
    }

    $scope.$watchCollection(
      angular.bind(this, function(){ return [this.alignment, this.groupBy] }),
      angular.bind(this, update)
    );

    update.call(this);  // Kick off the first update


    // Summarize per-site methlyation levels across the alignment by optional
    // grouping field.
    //
    function summarize(alignment, groupBy) {
      if (!alignment)
        return;

      $log.debug("Building heatmap data, grouped by: ", groupBy);

      // Group by given field (tissue, patient, sample, culture, etc) or just
      // lump everything together.
      var groupByAccessor = groupBy
        ? dl.accessor(groupBy)
        : function(){ return "All sequences" };

      // Only reference sites are interesting to return since novel sites
      // usually aren't shared across the alignment.
      var referenceSites = alignment.reference.stats.CpG.sites;

      var data = alignment.analysisSites
        .filter(function(d){ return !d.sequence.isReference })
        .filter(function(d){ return d.type === "CpG" && d.isInReference });

      // Build a nested structure first by the grouping field and then within
      // each group, by site.  For each alignment site, the sequence sites are
      // collapsed into counts.
      return d3.nest()
        .key(groupByAccessor)
        .rollup(function(values) {
          var valuesBySite =
            d3.nest()
              .key(dl.accessor("site"))
              .map(values);

          var sites = referenceSites.map(function(refSite) {
            var site = {
              key: refSite,
              values: {
                count:           (valuesBySite[refSite] || []).length,
                methylatedCount: (valuesBySite[refSite] || [])
                  .filter(function(d){ return d.status === "methylated" })
                  .length
              }
            };

            // For convenience in our template, pre-calculate this.
            site.values.fractionMethylated = site.values.methylatedCount / site.values.count;

            return site;
          });

          sites.sequenceCount   = dl.count.distinct(values, "sequence.id");
          sites.meanMethylation = dl.mean(sites,
            function(d){ return d.values.methylatedCount / d.values.count });
          return sites;
        })
        .entries(data);
    }
  }

})();
// vim: set ts=2 sw=2 :
