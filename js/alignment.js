(function(){
  'use strict';

  window.Alignment = Alignment;

  function Alignment(fasta, name) {
    this.name = name;
    this.sequences = this.parse(fasta);
    this.assertValidAlignment();

    this.cpgSites      = this._cpgSites();
    this.cphSites      = this._cphSites();
    this.analysisSites = this.cpgSites.concat(this.cphSites);

    // Make some properties above read-only
    ["sequences", "cpgSites", "cphSites", "analysisSites"].forEach(function(prop) {
      Object.defineProperty(this, prop, { writable: false });
    }, this);

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
          .split(/\s+/, 2);

        sequence = {
          id:          name[0],
          description: name[1],
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
    });

    if (sequence)
      fasta.push(sequence);

    return fasta;
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
    var sites     = this.sequences.map(function(sequence, index){
      var CpG   = /[CT](?=-*G)/gi,
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
            index ===  0  ?    "reference" :
          siteNuc === 'C' ?   "methylated" :
          siteNuc === 'T' ? "unmethylated" :
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
    function findSites(sequence) {
      var CpH   = /C(?!-*G)/gi,
          sites = [],
          site;

      while (site = CpH.exec(sequence.seq))
        sites.push(site.index + 1)

      return sites;
    }

    // Collect reference CpH sites so we can check them in each converted sequence
    var reference       = this.sequences[0];
    var referenceSites  = findSites(reference);
    var isReferenceSite = dl.toMap(referenceSites);

    var sequenceSites = this.sequences.slice(1).map(function(sequence, index) {
      var sites = [];

      // Check all reference sites against this converted sequence
      referenceSites.forEach(function(site) {
        var nuc = sequence.seq.substr(site - 1, 1).toUpperCase();

        // Reference sites which aren't C/T in the converted sequence were not
        // cytosines to begin with.
        if (nuc !== 'C' && nuc !== 'T')
          return;

        sites.push({
          sequence: sequence,
          type:     "CpH",
          site:     site,
          status:   nuc === 'C' ? "unconverted" : "converted"
        });
      });

      // Add in any novel CpH for this sequence which failed.  Note that we
      // can't tell apart novel CpGs which were converted vs. novel TpGs.
      findSites(sequence)
        .filter(function(site){ return !isReferenceSite[site] })
        .forEach(function(site) {
          sites.push({
            sequence: sequence,
            type:     "CpH",
            site:     site,
            status:   "unconverted"
          });
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

    // Add one row per sequence, summarizing the set of sites for each sequence
    rows = rows.concat(
      bySequenceAndType.map(function(seq) {

          // Methylated CpG sites in this sequence
          var methylations = seq.values.CpG
            .filter(function(site){ return site.status === 'methylated' });

          var isMethylatedAtSite = dl.toMap(methylations, 'site');

          // Methylation status of this sequence at every CpG site in the alignment
          var siteColumns = alignmentSites.map(function(site) {
            return isMethylatedAtSite[site] ? site : "";
          });

          // Failed sites
          var failures = seq.values.CpH
            .filter(function(site){ return site.status === 'unconverted' });

          // Row for this sequence, matching the header row above
          return [
            seq.key,
            seq.values.CpG.length,
            methylations.length,
            (methylations.length / seq.values.CpG.length * 100).toFixed(1)
          ].concat(siteColumns).concat([
            seq.values.CpH.length,
            failures.length,
            ((seq.values.CpH.length - failures.length) / seq.values.CpH.length * 100).toFixed(1),
            failures.map(dl.accessor('site')).join(', ')
          ]);
        })
    );

    return rows;
  };

})();
// vim: set ts=2 sw=2 :
