window.Alignment = {

  // Parse a FASTA file
  //
  parse: function(text) {
    var fasta = [],
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
  },


  // Tally CpG sites and their methylation status from a set of
  // multiply-aligned sequences.
  //
  cpgSites: function(alignment) {
    // Sanity check alignment before tallying data
    if (alignment.length < 2) {
      throw "Alignment must contain at least two sequences " +
            "(a reference and a bisulfite-converted)";
    }

    // XXX TODO: check that ids are unique

    var reference = alignment[0];
    var sites     = alignment.map(function(sequence, index){

      // Only the first sequence is the reference
      sequence.isRef = index === 0;

      var CpG   = /[CT](?=G)/gi,
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
          sequence.isRef  ?    "reference" :
          siteNuc === 'C' ?   "methylated" :
          siteNuc === 'T' ? "unmethylated" :
                                      null ;

        sites.push({
          sequence: sequence,
          site:     site.index + 1,
          status:   status
        });
      }

      return sites;
    }, this);

    // Flatten the array of arrays
    return sites
      .reduce(function(a,b){ return a.concat(b) });
  },


  // Convert a tidy dataset of CpG sites (from the function above) into an
  // untidy table that's useful for presenting the data in a spreadsheet.
  //
  cpgSitesToTable: function(cpgSites) {
    // Collect all unique CpG sites in the alignment
    var alignmentSites = dl.unique(
      cpgSites
        .map(function(s){ return s.site })
        .sort(function(a,b){ return a - b })
    );

    // Some static columns plus a column per site
    var rows = [
      ["Sequence", "CpG sites", "Methylated sites", "% Methylation"]
        .concat(alignmentSites)
    ];

    // Add one row per sequence, summarizing the set of sites for each sequence
    rows = rows.concat(
      dl.groupby('sequence.id')
        .summarize([{ name: '*', ops: ['values'], as: ['cpgSites'] }])
        .execute(cpgSites)
        .map(function(seq) {

          // Methylated CpG sites in this sequence
          var methylations = seq.cpgSites
            .filter(function(site){ return site.status === 'methylated' });

          var methylationsBySite = dl.toMap(methylations, 'site');

          // Methylation status of this sequence at every CpG site in the alignment
          var siteColumns = alignmentSites.map(function(site) {
            return methylationsBySite[site] ? site : "";
          });

          // Row for this sequence, matching the header row above
          return [
            seq["sequence.id"],
            seq.cpgSites.length,
            methylations.length,
            (methylations.length / seq.cpgSites.length * 100).toFixed(1)
          ].concat(siteColumns);

        })
    );

    return rows;
  }

};
// vim: set ts=2 sw=2 :
