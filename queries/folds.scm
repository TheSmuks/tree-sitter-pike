; Code folding regions for tree-sitter-pike.
; Follows the tree-sitter `@fold` capture convention.

[
  (block)
  (class_body)
  (mapping_literal)
  (array_literal)
  (multiset_literal)
  (switch_statement)
  (argument_list)
] @fold

; Multi-line comments fold as a unit.
(block_comment) @fold
(autodoc_comment) @fold
