; Language injections for tree-sitter-pike.
; Consumers that ship a `comment` parser (e.g. nvim-treesitter) use this to
; highlight TODO/FIXME/NOTE tags and other markup inside comments.

((line_comment) @injection.content
  (#set! injection.language "comment"))

((block_comment) @injection.content
  (#set! injection.language "comment"))

((autodoc_comment) @injection.content
  (#set! injection.language "comment"))
