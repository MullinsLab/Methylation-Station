// vim: set ft=javascript sw=2 ts=2 :
var MethylationVizSpec = {
  // We don't use a fixed height.  It's dynamic based on the number of
  // sequences in the alignment.  The width is a default which is dynamically
  // modified by the application to fit the visualization container's width.
  // Strict padding means that Vega will try to fit the whole visualization
  // into the view width instead of allowing marks to expand the width.
  "width": 700,
  "height": 0,
  "padding": "strict",

  // Hovering over a sequence site, sequence name, or sequence axis highlights
  // that row of the alignment.
  "signals": [
    {
      "name": "highlight",
      "init": null,
      "streams": [
        {"type": "@sequence:mouseover",     "expr": "datum.sequenceId"},
        {"type": "@sequence:mouseout",      "expr": "null"},
        {"type": "@sequenceName:mouseover", "expr": "datum.sequenceId"},
        {"type": "@sequenceName:mouseout",  "expr": "null"},
        {"type": "@sequenceAxis:mouseover", "expr": "datum.sequenceId"},
        {"type": "@sequenceAxis:mouseout",  "expr": "null"}
      ]
    }
  ],

  "data": [
    // The primary analysis data of the alignment.  A record per CpG/CpH site.
    {
      "name": "alignment",
      "format": {
        "parse": {
          "site": "integer"
        }
      },
      "transform": [
        // We don't currently care about successfully converted CpH sites
        { "type": "filter", "test": "datum.status !== 'converted'" }
      ]
    },

    // Group/facet sites by their sequence.  This lets us use Vega group marks
    // to draw each sequence and then draw each site in the context of the
    // sequence.
    {
      "name": "alignmentBySequence",
      "source": "alignment",
      "transform": [
        // Vega can't usefully group by a nested field, so we copy the sequence
        // id into the root object.
        { "type": "formula", "field": "sequenceId", "expr": "datum.sequence.id" },
        { "type": "facet", "groupby": "sequenceId" },

        // Copy the sequence object for this group of sites into the root
        // object so we can more easily refer to it.
        { "type": "formula", "field": "sequence", "expr": "datum.values[0].sequence" },

        // We'll use displayIndex to display the sequences in a desired order,
        // if available, falling back to the original alignment order.
        { "type": "formula", "field": "displayIndex", "expr": "datum.sequence.displayIndex || datum.sequence.index" }
      ]
    },

    // All unique CpG sites in the alignment, for the purposes of labeling.
    {
      "name": "alignmentCpGSites",
      "source": "alignment",
      "transform": [
        { "type": "filter", "test": "datum.type === 'CpG'" },
        { "type": "aggregate", "groupby": ["site"], "summarize": {"*": "count"} }
      ]
    },

    // Extract the reference sequence (always the first sequence in the
    // alignment) so we can draw it separately.  Precompute the length of the
    // alignment for our x scale.
    {
      "name": "reference",
      "source": "alignmentBySequence",
      "transform": [
        { "type": "filter", "test": "datum.sequence.index === 0" },
        { "type": "formula", "field": "length", "expr": "datum.sequence.seq.length" }
      ]
    },

    // Filter out the reference sequence so we can draw the non-reference
    // sequences separately.
    {
      "name": "sequences",
      "source": "alignmentBySequence",
      "transform": [
        { "type": "filter", "test": "datum.sequence.index > 0" }
      ]
    }
  ],

  "scales": [
    // A global x scale just mapping the width of our image to the length of
    // the alignment.
    {
      "name": "x",
      "type": "linear",
      "range": "width",
      "round": true,
      "domainMin": 1,
      "domainMax": {"data": "reference", "field": "length"},
      "zero": false
    },

    // Fill colors for each site status
    {
      "name": "fill",
      "type": "ordinal",
      "domain": ["methylated", "unmethylated", "unconverted"],
      "range": ["#333", "white", "red"]
    }
  ],

  "marks": [
    // Draw sequence names on the left hand side
    {
      "name": "sequenceName",
      "type": "text",
      "from": {
        "data": "sequences",
        "transform": [
          // Rendering the names from bottom to top means that text above will
          // overlap text below.  This is desired when a sequence name is
          // highlighted and the font size increased such that minor overlap
          // occurs.
          {"type": "sort", "by": "-displayIndex"}
        ]
      },
      "properties": {
        "update": {
          "text": {"field": "sequenceId"},
          "fill": [
            {"value": "blue", "test": "highlight === datum.sequenceId"},
            {"value": "#888"}
          ],
          "align": {"value": "left"},
          "fontSize": [
            {"value": 13, "test": "highlight === datum.sequenceId"},
            {"value": 11}
          ],
          "baseline": {"value": "middle"},
          "x": {"field": {"group": "width"}, "offset": 10},
          "y": {"field": "displayIndex", "mult": 10},
          "dy": {"value": 2}
        }
      }
    },

    // Draw an axis line for each sequence representing it
    {
      "name": "sequenceAxis",
      "type": "rule",
      "from": {
        "data": "sequences"
      },
      "properties": {
        "update": {
          "x": {"value": 0},
          "x2": {"field": {"group": "width"}},
          "y": {"field": "displayIndex", "mult": 10},
          "stroke": [
            {"value": "blue", "test": "highlight === datum.sequenceId"},
            {"value": "#888"}
          ]
        }
      }
    },

    // Draw the reference name
    {
      "name": "referenceName",
      "type": "text",
      "from": {
        "data": "reference"
      },
      "properties": {
        "update": {
          "text": {"field": "sequenceId"},
          "fill": {"value": "#888"},
          "align": {"value": "left"},
          "fontSize": {"value": 11},
          "baseline": {"value": "bottom"},
          "x": {"field": {"group": "width"}, "offset": 10},
          "y": {"field": "displayIndex", "mult": 10}
        }
      }
    },

    // Label all CpG sites with numbers
    {
      "name": "alignmentCpgSites",
      "type": "text",
      "from": {
        "data": "alignmentCpGSites"
      },
      "properties": {
        "update": {
          "text": {"field": "site"},
          "fontSize": {"value": 10},
          "fill": {"value": "#333"},
          "align": {"value": "left"},
          "baseline": {"value": "middle"},
          "angle": {"value": -45},
          "x": {"field": "site", "scale": "x"},
          "y": {"value": 0}
        }
      }
    },

    // For each sequence, plot each site.  This is a group mark which produces
    // one group per sequence, with each group containing the marks for
    // individual sites.
    {
      "name": "sequence",
      "type": "group",
      "from": {
        "data": "sequences"
      },
      "properties": {
        "update": {
          "x": {"value": 0},
          "y": {"field": "displayIndex", "mult": 10}
        }
      },
      "marks": [
        {
          "type": "symbol",
          "properties": {
            "update": {
              "x": {"scale": "x", "field": "site"},
              "y": {"value": 0},
              "fill": [
                {"value": "blue", "test": "highlight === datum.sequenceId && datum.status === 'methylated'"},
                {"scale": "fill", "field": "status"}
              ],
              "stroke": [
                {"field": "status", "scale": "fill", "test": "datum.status === 'unconverted'"},
                {"value": "blue", "test": "highlight === datum.sequenceId"},
                {"value": "#333"}
              ],
              "shape": {"value": "circle"},
              "size": [
                {"value": 14, "test": "datum.status === 'unconverted'"},
                {"value": 50}
              ]
            }
          }
        }
      ]
    }
  ]
}
