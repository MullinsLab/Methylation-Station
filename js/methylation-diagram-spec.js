// vim: set ft=javascript sw=2 ts=2 :
var MethylationDiagramSpec = {
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
    },
    { "name": "siteLabelField",  "init": "site" },
    { "name": "siteLabelOffset", "init": 0 },
    { "name": "hideSequenceLabels", "init": false }
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
        { "type": "formula", "field": "displayIndex", "expr": "datum.sequence.displayIndex || datum.sequence.index" },

        // Labels
        {
          "type": "formula",
          "field": "_label",
          "expr": "format('.0f', datum.sequence.stats.CpG.percentMethylated) + '% – ' + datum.sequence.id + (datum.sequence.count ? ' (n=' + format(',d', datum.sequence.count) + ')' : '')"
        }
      ]
    },

    // All unique CpG sites in the alignment, for the purposes of labeling.
    {
      "name": "alignmentCpGSites",
      "source": "alignment",
      "transform": [
        { "type": "filter", "test": "datum.type === 'CpG'" },
        { "type": "aggregate", "groupby": ["site"], "summarize": {"*": "count"} },
        { "type": "sort", "by": ["site"] },
        { "type": "rank" },
        {
          "type": "formula",
          "field": "_siteLabel",
          "expr": "if(siteLabelField, datum[siteLabelField] + (siteLabelOffset || ''), '')"
        }
      ]
    },

    // Extract the reference sequence (always the first sequence in the
    // alignment) so we can draw it separately.  Precompute the length of the
    // alignment for our x scale.
    {
      "name": "reference",
      "source": "alignmentBySequence",
      "transform": [
        { "type": "filter", "test": "datum.sequence.isReference" },
        { "type": "formula", "field": "length", "expr": "datum.sequence.seq.length" }
      ]
    },

    // Filter out the reference sequence so we can draw the non-reference
    // sequences separately.
    {
      "name": "sequences",
      "source": "alignmentBySequence",
      "transform": [
        { "type": "filter", "test": "!datum.sequence.isReference" }
      ]
    },

    // Group/facet sequences by their grouping field
    {
      "name": "sequencesByGroup",
      "source": "sequences",
      "transform": [
        // Vega can't usefully group by a nested field, so we copy the group key
        // into the root object.
        { "type": "formula", "field": "sequenceGroup", "expr": "datum.sequence.group" },

        // Calculate a global sequence display order (rank) which preserves the
        // original desired display order within each group while ordering
        // groups themselves by value.
        { "type": "sort", "by": ["sequenceGroup", "displayIndex"] },
        { "type": "rank" },

        // Facet sequences by their group value
        {
          "type": "facet",
          "groupby": "sequenceGroup",

          // Calculate the lowest sequence rank within each group, so we know
          // where this group starts relative to all (ungrouped) sequences.
          "summarize": [
            { "ops": ["min"], "field": "rank", "as": ["firstSequenceRank"] }
          ],

          // Re-calculate individual sequence display indexes _within_ each
          // group, preserving order, so every group's set of sequences starts
          // at displayIndex = 0.  This makes the mark definitions simpler.
          "transform": [
            { "type": "rank", "by": "displayIndex" },
            { "type": "formula", "field": "displayIndex", "expr": "datum.rank - 1" },

            // Sort sequences so they render from bottom to top, so that that
            // text above will overlap text below.  This is desired when a
            // sequence name is highlighted and the font size increased such
            // that minor overlap occurs.
            //
            // Previously this sort was in the sequenceName mark as an inline
            // transform, but that triggered a data flow bug in Vega.  See
            //
            //    https://mullinslab.slack.com/archives/C0AEZ0Z9R/p1506106578000136
            //
            // for some conversation of that.  In any case, there's no harm in
            // moving the sort up into the dataset itself.
            { "type": "sort", "by": "-displayIndex" }
          ]
        },

        // Finally, calculate a sparse displayIndex for the _group_ based on
        // the number of sequences displayed before this group
        // (firstSequenceRank - 1) and the number of groups before this one
        // (rank - 1).  This gaps the calculated value by 1 between groups.
        // Since the reference is displayed separately from these groups, our
        // displayIndex should always start at 1, not 0, thus the leading
        // constant.
        { "type": "rank" },
        { "type": "formula", "field": "displayIndex", "expr": "1 + (datum.firstSequenceRank - 1) + (datum.rank - 1)" },
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

    // Fill and stroke colors and circle sizes for each site status.
    //
    // URL references are to SVG definitions external to this file, but
    // embedded in the HTML document.  They could live in a separate SVG file,
    // but Chrome doesn't support remote URL references for SVG despite it
    // being a key feature in the spec.  If the external definitions aren't
    // available, the fallback color is used.
    {
      "name": "fill",
      "type": "ordinal",
      "domain": ["methylated", "unmethylated", "mixed", "unconverted", "partial"],
      "range": ["#333", "white", "url(#half-filled) #ccc", "red", "url(#half-filled-red) #fcc"]
    },
    {
      "name": "gradient-fill",
      "type": "quantize",
      "domain": [0, 1],
      "range": [
        // Fallback solid colors generated with:
        //   d3.range(0, 1, 1/5).concat(1).map(d3.interpolateRgb("white", "#333"))
        "white",
        "url(#diagonal-stripe-2) #d6d6d6",
        "url(#diagonal-stripe-3) #adadad",
        "url(#diagonal-stripe-4) #858585",
        "url(#diagonal-stripe-5) #5c5c5c",
        "#333"
      ]
    },
    {
      "name": "highlight-fill",
      "type": "ordinal",
      "domain": ["methylated", "unmethylated", "mixed", "unconverted", "partial"],
      "range": ["blue", "white", "url(#half-filled-blue) #ccf", "red", "url(#half-filled-red) #fcc"]
    },
    {
      "name": "highlight-gradient-fill",
      "type": "quantize",
      "domain": [0, 1],
      "range": [
        // Fallback solid colors generated with:
        //   d3.range(0, 1, 1/5).concat(1).map(d3.interpolateRgb("white", "blue"))
        "white",
        "url(#blue-diagonal-stripe-2) #ccf",
        "url(#blue-diagonal-stripe-3) #99f",
        "url(#blue-diagonal-stripe-4) #66f",
        "url(#blue-diagonal-stripe-5) #33f",
        "blue"
      ]
    },
    {
      "name": "stroke",
      "type": "ordinal",
      "domain": ["methylated", "unmethylated", "mixed", "unconverted", "partial"],
      "range": ["#333", "#333", "#333", "red", "red"]
    },
    {
      "name": "highlight-stroke",
      "type": "ordinal",
      "domain": ["methylated", "unmethylated", "mixed", "unconverted", "partial"],
      "range": ["blue", "blue", "blue", "red", "red"]
    },
    {
      "name": "stroke-width",
      "type": "ordinal",
      "domain": ["CpG", "CpH"],
      "range": ["1px", "0.8px"]
    },
    {
      "name": "size",
      "type": "ordinal",
      "domain": ["methylated", "unmethylated", "mixed", "unconverted", "partial"],
      "range": [50, 50, 50, 14, 14]
    }
  ],

  "marks": [
    // Draw the reference name
    {
      "name": "referenceName",
      "type": "text",
      "from": {
        "data": "reference"
      },
      "properties": {
        "update": {
          "text": [
            {"value": "", "test": "hideSequenceLabels"},
            {"field": "sequenceId"}
          ],
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
          "text": {"field": "_siteLabel"},
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

    // Group mark for each group of sequences, spacing them out
    {
      "name": "sequenceGroup",
      "type": "group",
      "from": {
        "data": "sequencesByGroup"
      },

      // Calculate vertical start position of each group.  The multiplier
      // should match the one used for spacing out _sequences_ by displayIndex.
      "properties": {
        "update": {
          "x": {"value": 0},
          "y": {"field": "displayIndex", "mult": 10},
          "width": {"field": {"group": "width"}}
        }
      },

      // Marks for each sequence within the sequence group
      "marks": [

        // Draw sequence names on the right hand side
        {
          "name": "sequenceName",
          "type": "text",
          "properties": {
            "update": {
              "text": [
                {"value": "", "test": "hideSequenceLabels"},
                {"field": "_label"}
              ],
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

        // For each sequence, plot each site.  This is a group mark which produces
        // one group per sequence, with each group containing the marks for
        // individual sites.
        {
          "name": "sequence",
          "type": "group",
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
                    { "field": "fractionMethylated", "scale": "highlight-gradient-fill", "test": "highlight === datum.sequenceId && datum.fractionMethylated != null && datum.type === 'CpG'" },
                    { "field": "status",             "scale": "highlight-fill",          "test": "highlight === datum.sequenceId" },
                    { "field": "fractionMethylated", "scale": "gradient-fill",           "test": "datum.fractionMethylated != null && datum.type === 'CpG'" },
                    { "field": "status",             "scale": "fill" }
                  ],
                  "stroke": [
                    {"field": "status", "scale": "highlight-stroke", "test": "highlight === datum.sequenceId"},
                    {"field": "status", "scale": "stroke"}
                  ],
                  "strokeWidth": {"field": "type", "scale": "stroke-width"},
                  "shape": {"value": "circle"},
                  "size": {"field": "status", "scale": "size"}
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
