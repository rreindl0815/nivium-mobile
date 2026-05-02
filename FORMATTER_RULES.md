# Formatter Rules

## Layer Boundary Continuity

Always make layer boundaries continuous.

Rule:

- the top depth of a lower layer should default to the bottom depth of the layer above

Examples:

- if a guide says `0-3 cm` and then says `4-25 cm`, normalize the second layer to `3-25 cm`
- if a guide says `0-10 cm` and then says `next layer down to 45`, interpret that as `10-45 cm`

Reason:

- guides may skip or round the starting number of the next layer
- the formatter should preserve a continuous snow profile unless the guide clearly states otherwise

Implementation note:

- when parsing a new layer, if only the lower boundary is confidently spoken, use the previous layer bottom as the new layer top
- when parsing a new layer with a mismatched top number, prefer continuity and replace that top number with the previous layer bottom
