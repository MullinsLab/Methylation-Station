(function(){
  'use strict';

  window.Alignment = Alignment;

  function Alignment(fasta, name) {
    this.name = name;
    this.sequences = this.parse(fasta);
    this.reference = this.sequences[0];
    this.assertValidAlignment();

    this.cpgSites      = this._cpgSites();
    this.cphSites      = this._cphSites();
    this.analysisSites = this.cpgSites.concat(this.cphSites);

    // Make some properties above read-only
    ["sequences", "reference", "cpgSites", "cphSites", "analysisSites"].forEach(function(prop) {
      Object.defineProperty(this, prop, { writable: false });
    }, this);

    this._calculateStats();

    this.sequences.tags =
      dl.unique(
        this.sequences
          .map(dl.accessor("tags"))
          .map(Object.keys)
          .reduce(function(a,b){ return a.concat(b) })
      ).map(function(d){
        return {
          name: d,
          path: "tags." + d
        }
      });

    return this;
  }


  // Parse a FASTA file
  //
  Alignment.prototype.parse = function(text) {
    var fasta = [],
        index = 0,
        sequence;

    text.split(/\r\n|\r|\n/).forEach(function(line){
      if (line.match(/^>/)) {
        if (sequence)
          fasta.push(sequence);

        var name = line
          .replace(/^>/, '')
          .split(/\s+/);

        var id          = name[0];
        var description = name.slice(1).join(" ");

        sequence = {
          id:          id,
          description: description,
          tags:        this.parseTags(description),
          isReference: index === 0,
          index:       index++,
          seq:         ""
        };
      }
      else if (sequence) {
        if (line.match(/\S/))
          sequence.seq += line.replace(/\s+/, '', 'g');
      }
      else {
        throw "No sequence name found";
      }
    }, this);

    if (sequence)
      fasta.push(sequence);

    return fasta;
  };


  // Parse [key=value] tags from a description line
  //
  Alignment.prototype.parseTags = function(description) {
    if (!description)
      return {};

    var Tag  = /\[(.+?)\s*=\s*(.+?)\]/g,
        tags = {},
        match;

    while (match = Tag.exec(description))
      tags[match[1]] = match[2];

    return tags
  };


  // Return a sequence in this alignment by id
  //
  Alignment.prototype.getSequence = function(id) {
    return d3.map(this.sequences, dl.accessor('id')).get(id);
  };


  // Alignments used for methylation purposes must have at least two sequences
  // and use unique sequence names
  //
  Alignment.prototype.assertValidAlignment = function() {
    if (this.sequences.length < 2) {
      throw "Alignment must contain at least two sequences " +
            "(a reference and a bisulfite-converted)";
    }

    var duplicates =
      dl.groupby('id')
        .count()
        .execute(this.sequences)
        .filter(function(d){ return d.count > 1 });

    if (duplicates.length) {
      throw "The following sequence names were found more than once in the alignment: " +
            duplicates.map(dl.accessor('id')).join(', ');
    }
  };


  // Tally CpG sites and their methylation status from a set of
  // multiply-aligned sequences.
  //
  Alignment.prototype._cpgSites = function() {
    var reference = this.sequences[0];
    var sites     = this.sequences.map(function(sequence) {
      var CpG   = /[CTY](?=-*G)/gi,
          sites = [],
          site;

      while (site = CpG.exec(sequence.seq)) {
        var refNuc  = reference.seq.substr(site.index, 1).toUpperCase();
        var siteNuc = site[0].toUpperCase();

        // If the site is T but the reference nucleotide isn't a C, then we don't
        // know what this site might be.  It could have been an unmethylated,
        // point-mutation-introduced CpG converted by the bisulfite-treatment to
        // TpG, or it could have always been a TpG.
        if (siteNuc === 'T' && refNuc !== 'C')
          continue;

        var status =
          sequence.isReference ?    "reference" :
               siteNuc === 'C' ?   "methylated" :
               siteNuc === 'T' ? "unmethylated" :
               siteNuc === 'Y' ?        "mixed" :
                                           null ;

        sites.push({
          sequence: sequence,
          site:     site.index + 1,
          type:     "CpG",
          status:   status
        });
      }

      return sites;
    });

    var isReferenceSite = dl.toMap(sites[0], 'site');

    // Flatten the array of arrays
    sites = sites.reduce(function(a,b){ return a.concat(b) });

    // Mark sites as in the reference or not (novel to this sequence)
    sites = sites.map(function(d){
      d.isInReference = isReferenceSite[d.site];
      return d;
    });

    return sites;
  };


  // Tally the status of non-CpG cytosines (i.e. CpH sites, H = A/C/T) from a
  // set of multiply-aligned sequences, in order to assess completeness of the
  // bisulfite-conversion process and thus confidence in the methylation data.
  //
  Alignment.prototype._cphSites = function() {
    function findSites(sequence, includeAmbig) {
      var CpH   = includeAmbig ? /[CY](?!-*G)/gi : /C(?!-*G)/gi,
          sites = [],
          site;

      while (site = CpH.exec(sequence.seq))
        sites.push(site.index + 1)

      return sites;
    }

    function sequenceSiteRecord(sequence, site) {
      var nuc = sequence.seq.substr(site - 1, 1).toUpperCase();

      // Reference sites which aren't C/T/Y in the converted sequence were
      // not cytosines to begin with.
      if (nuc !== 'C' && nuc !== 'T' && nuc !== 'Y')
        return;

      var status =
        nuc === 'C' ? "unconverted" :
        nuc === 'T' ?   "converted" :
        nuc === 'Y' ?     "partial" :
                               null ;

      return {
        sequence: sequence,
        type:     "CpH",
        site:     site,
        status:   status
      };
    }

    // Collect reference CpH sites so we can check them in each converted sequence
    var reference       = this.sequences[0];
    var referenceSites  = findSites(reference, false);
    var isReferenceSite = dl.toMap(referenceSites);

    var sequenceSites = this.sequences.slice(1).map(function(sequence) {
      var sites = [];

      // Check all reference sites against this converted sequence
      referenceSites.forEach(function(site) {
        var record = sequenceSiteRecord(sequence, site);
        if (record)
          sites.push(record);
      });

      // Add in any novel CpH for this sequence which failed.  Note that we
      // can't tell apart novel CpHs which were converted vs. novel TpHs.
      findSites(sequence, true)
        .filter(function(site){ return !isReferenceSite[site] })
        .forEach(function(site) {
          var record = sequenceSiteRecord(sequence, site);
          if (record)
            sites.push(record);
        });

      return sites;
    });

    // Add reference sites back into final dataset for completeness.  This is
    // useful when computing the table.
    sequenceSites.unshift(
      referenceSites.map(function(site) {
        return {
          sequence: reference,
          type:     "CpH",
          site:     site,
          status:   "converted"
        }
      })
    );

    // Flatten the array of arrays
    return sequenceSites
      .reduce(function(a,b){ return a.concat(b) });
  };


  Alignment.prototype._calculateStats = function() {
    // Group all analysis sites by sequence and then type (CpG/CpH)
    var bySequenceAndType =
      d3.nest()
        .key(dl.accessor('sequence.id'))
        .rollup(function(values){
          return d3.nest()
            .key(dl.accessor('type'))
            .map(values)
        })
        .entries(this.analysisSites);

    bySequenceAndType.forEach(function(d) {
      var sequence = this.getSequence(d.key);
      if (!sequence)
        throw "Assertion failed: No sequence for id " + d.key;

      // Make sure we always have an array even if there were no such sites
      if (!d.values.CpG) d.values.CpG = []
      if (!d.values.CpH) d.values.CpH = []

      // Methylated CpG sites in this sequence
      var methylations = d.values.CpG
        .filter(function(site){ return site.status === 'methylated' })
        .map(dl.accessor('site'));

      var mixedMethylations = d.values.CpG
        .filter(function(site){ return site.status === 'mixed' })
        .map(dl.accessor('site'));

      // Failed sites
      var failures = d.values.CpH
        .filter(function(site){ return site.status !== 'converted' })
        .map(dl.accessor('site'));

      // Add calculated stats to our stored sequences
      sequence.stats = {
        CpG: {
          sites:              d.values.CpG.map(dl.accessor('site')),
          count:              d.values.CpG.length,
          methylatedCount:    methylations.length,
          percentMethylated:  methylations.length / d.values.CpG.length * 100,
          methylatedSites:    methylations,
          mixedSites:         mixedMethylations
        },
        CpH: {
          count:              d.values.CpH.length,
          unconvertedCount:   failures.length,
          percentConverted:   (d.values.CpH.length - failures.length) / d.values.CpH.length * 100,
          failedSites:        failures
        }
      };
    }, this);
  };


  // Convert a tidy dataset of analysis sites into an untidy table that's
  // useful for presenting the data in a spreadsheet.
  //
  Alignment.prototype.asTable = function() {
    // Collect all unique CpG sites in the alignment
    var alignmentSites = dl.unique(
      this.cpgSites
        .map(function(s){ return s.site })
        .sort(function(a,b){ return a - b })
    );

    // Some static columns plus a column per site
    var rows = [
      ["Sequence", "CpG sites", "Methylated sites", "% Methylation"]
        .concat(alignmentSites)
        .concat(["CpH sites", "Conversion failures", "Conversion rate", "Failed sites"])
    ];

    // Add one row per sequence, summarizing the set of sites for each sequence
    rows = rows.concat(
      this.sequences.map(function(seq) {

        // CpG and methylated CpG sites in this sequence
        var hasCpGSite         = dl.toMap(seq.stats.CpG.sites);
        var isMethylatedAtSite = dl.toMap(seq.stats.CpG.methylatedSites);
        var isMixedAtSite      = dl.toMap(seq.stats.CpG.mixedSites);

        // Methylation status of this sequence at every CpG site in the alignment
        var siteColumns = alignmentSites.map(function(site) {
          return isMethylatedAtSite[site] ?    site :
                      isMixedAtSite[site] ? "mixed" :
                         hasCpGSite[site] ?      "" :
                                               "NA" ;
        });

        // Row for this sequence, matching the header row above
        return [
          seq.id,
          seq.stats.CpG.count,
          seq.stats.CpG.methylatedCount,
          seq.stats.CpG.percentMethylated.toFixed(1)
        ].concat(siteColumns).concat([
          seq.stats.CpH.count,
          seq.stats.CpH.unconvertedCount,
          seq.stats.CpH.percentConverted.toFixed(1),
          seq.stats.CpH.failedSites
            .map(function(site){ return seq.seq.substr(site - 1, 1).toUpperCase() + site })
            .join(', ')
        ]);
      })
    );

    return rows;
  };


  // Construct a heatmap object for this alignment.
  //
  Alignment.prototype.heatmap = function(groupBy) {
    return new AlignmentHeatmap(this, groupBy);
  };

})();
// vim: set ts=2 sw=2 :
