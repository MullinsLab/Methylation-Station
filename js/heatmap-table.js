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
        groups: '=?',
        orderBy: '=?',
        siteLabelField: '<?',
        siteLabelOffset: '<?'
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
      if (this.alignment) {
        $log.debug("Building heatmap data, grouped by: ", this.groupBy);
        var heatmap = this.alignment.heatmap(this.groupBy);
        this.groups = heatmap.groups;
      }
      else {
        this.groups = null;
      }
    }

    $scope.$watchCollection(
      angular.bind(this, function(){ return [this.alignment, this.groupBy] }),
      angular.bind(this, update)
    );

    update.call(this);  // Kick off the first update
  }

})();
// vim: set ts=2 sw=2 :
