; Local variable tracking for tree-sitter consumers (e.g., text editors, LSP)
; Follows the tree-sitter locals capture convention:
;   @local.scope     — nodes that introduce a new scope
;   @local.definition — nodes that define a variable/constant
;   @local.reference  — nodes that reference a variable

; ── Scopes ──

; Block scopes
(block) @local.scope

; Function scopes
(function_decl
  body: (block) @local.scope)
(function_decl
  name: (identifier) @local.definition)

; Class scopes
(class_body) @local.scope
(class_decl
  name: (identifier) @local.definition)

; Anonymous class/enum scopes
(anon_class) @local.scope
(anon_enum) @local.scope

; Loop scopes (while, do-while, for, foreach)
; These introduce a new scope for variables declared in the condition/init
(while_statement) @local.scope
(do_while_statement) @local.scope
(for_statement) @local.scope
(foreach_statement) @local.scope

; Switch scopes
(switch_statement) @local.scope

; Conditional scopes (if/else blocks introduce scope for decl-in-condition)
(if_statement) @local.scope

; Lambda scopes
(lambda_expr
  body: (block) @local.scope)

; Catch scope (variable caught is in outer scope, but catch block is a scope)
(catch_expr) @local.scope

; Gauge scope (execution time measurement)
(gauge_expr) @local.scope

; ── Definitions ──

; Variable declarations
(variable_decl
  name: (identifier) @local.definition)

; Local declarations in blocks
(local_declaration
  name: (identifier) @local.definition)

; Constant declarations
(constant_decl
  name: (identifier) @local.definition)

; Enum members
(enum_member
  name: (identifier) @local.definition)

; Function declarations (already matched above via name: @local.definition)

; Class declarations (already matched above via name: @local.definition)

; Typedef declarations
(typedef_decl
  name: (identifier) @local.definition)

; Function parameters
(parameter
  name: (identifier) @local.definition)

; For-loop initializer declarations
(for_init_decl
  name: (identifier) @local.definition)

; ── References ──

; Identifier references in expressions
(identifier_expr
  name: (identifier) @local.reference)