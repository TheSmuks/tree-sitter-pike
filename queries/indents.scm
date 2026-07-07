; Indentation rules for tree-sitter-pike.
; Follows the nvim-treesitter `@indent.*` capture convention.

[
  (block)
  (class_body)
  (mapping_literal)
  (array_literal)
  (multiset_literal)
  (argument_list)
] @indent.begin

; Closing delimiters end the indented region and align with the opener.
[
  "}"
  ")"
  "]"
] @indent.branch

[
  "}"
  ")"
  "]"
] @indent.end

; Comments and string literals should not influence indentation.
[
  (line_comment)
  (block_comment)
  (autodoc_comment)
  (string_literal)
  (hash_string)
] @indent.auto
