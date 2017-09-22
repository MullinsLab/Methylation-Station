// Summarize per-site methlyation levels across the alignment by optional
// grouping field.
//
(function(){
  'use strict';

  window.AlignmentHeatmap = AlignmentHeatmap;

  function AlignmentHeatmap(alignment, groupBy) {
    // Source alignment
    this.alignment = alignment;

    // Optionally group _sites_ by given _sequence_ field (tissue, patient,
    // sample, culture, etc), otherwise just lump everything together.
    this.groupBy = groupBy
      ? dl.accessor("sequence." + groupBy)
      : () => { return "All sequences" };

    this.groups = this._calculate();

    return this;
  }

  AlignmentHeatmap.prototype._calculate = function() {
    // Only reference sites are interesting to return since novel sites
    // usually aren't shared across the alignment.
    var referenceSites = this.alignment.reference.stats.CpG.sites;

    // Collect all unique CpG sites in the alignment and rank them for
    // ordinal numbering.  This is for fetching the overall alignment rank of
    // individual reference sites (since there may be novel, non-reference
    // sites between reference sites which affects ordinal site numbering).
    var alignmentSiteRank = new Map(
      dl.unique(
          this.alignment.cpgSites
            .map((s) => { return s.site })
            .sort((a,b) => { return a - b })
        )
        .map((s,i) => { return [s, i + 1] })
    );

    var data = this.alignment.cpgSites
      .filter((site) => { return !site.sequence.isReference && site.isInReference });

    // Build a nested structure first by the grouping field and then within
    // each group, by site.  For each alignment site, the sequence sites are
    // collapsed into counts.
    return d3.nest()
      .key(this.groupBy)
      .rollup(function(values) {
        var valuesBySite =
          d3.nest()
            .key(dl.accessor("site"))
            .map(values);

        var sites = referenceSites.map(function(refSite, index) {
          var site = {
            key: refSite,
            site: refSite,                         // Used in the UI for column headers
            rank: alignmentSiteRank.get(refSite),  // …ditto
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
          function(d){ return d.values.fractionMethylated });
        return sites;
      })
      .entries(data);
  };

})();
// vim: set sw=2 ts=2 :
