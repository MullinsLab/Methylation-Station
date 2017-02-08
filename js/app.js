window.URL = window.URL || window.webkitURL;

var globalState = {
  viz: document.querySelector("#viz")
};


function update(currentState, alignment) {
  if (alignment.length < 2) {
    console.error("Alignment must contain at least two sequences (a reference and a bisulfite-converted)")
    return;
  }

  var newState = {
    viz:         currentState.viz,
    alignment:   alignment,
    reference:   alignment[0],
    methylation: [],
  };

  newState.reference.isRef = true;

  alignment.forEach(function(sequence) {
    var CpG = /[CT](?=G)/gi,
        site;

    while (site = CpG.exec(sequence.seq)) {
      var refNuc  = newState.reference.seq.substr(site.index, 1).toUpperCase();
      var siteNuc = site[0].toUpperCase();

      // If the site is T but the reference nucleotide isn't a C, then we don't
      // know what this site might be.  It could have been an unmethylated,
      // point-mutation-introduced CpG converted by the bisulfite-treatment to
      // TpG, or it could have always been a TpG.
      if (siteNuc === 'T' && refNuc !== 'C')
        continue;

      var status = sequence.isRef  ?    "reference" :
                   siteNuc === 'C' ?   "methylated" :
                   siteNuc === 'T' ? "unmethylated" :
                                               null ;

      newState.methylation.push({
        sequence: sequence,
        site:     site.index + 1,
        status:   status
      });
    }
  });

  return newState;
}


function render(state) {
  if (!state.viz || !state.methylation)
    return;

  vg.parse.spec("spec.json", function(error, chart) {
    if (error) {
      console.error(error);
      return;
    }

    var view = chart({
      el: state.viz,
      renderer: "svg"
    });

    view.data("alignment")
      .insert(state.methylation);

    view.update();
  });
}


function handleFiles(files, input) {
  if (!files[0]) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    render(globalState = update(globalState, parseFasta(ev.target.result)));
  };
  reader.readAsText(files[0]);
}


function parseFasta(text) {
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
    } else {
      sequence.seq += line.replace(/\s+/, '', 'g');
    }
  });
  fasta.push(sequence);

  return fasta;
}


function toArray(iterable) {
  return Array.prototype.slice.call(iterable);
}

// vi: set ts=2 sw=2 :
