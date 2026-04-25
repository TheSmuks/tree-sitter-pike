; Function definitions
(function_decl
  name: (identifier) @name) @definition.function

; Class definitions
(class_decl
  name: (identifier) @name) @definition.class

; Enum definitions
(enum_decl
  name: (identifier) @name) @definition.enum

; Type definitions
(typedef_decl
  name: (identifier) @name) @definition.type

; Constants
(constant_decl
  name: (identifier) @name) @definition.constant

; Enum members
(enum_member
  name: (identifier) @name) @definition.constant

; Class methods (functions inside class_body)
(class_body
  (declaration
    (function_decl
      name: (identifier) @name) @definition.method))

; Class fields (variables inside class_body)
(class_body
  (declaration
    (variable_decl
      name: (identifier) @name) @definition.field))

; Inherit declarations
(inherit_decl) @reference.class
