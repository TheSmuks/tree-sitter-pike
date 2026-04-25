; Function definitions
(function_decl
  (identifier) @name) @definition.function

; Class definitions
(class_decl
  (identifier) @name) @definition.class

; Enum definitions
(enum_decl
  (identifier) @name) @definition.enum

; Type definitions
(typedef_decl
  (identifier) @name) @definition.type

; Constants
(constant_decl
  (identifier) @name) @definition.constant

; Enum members
(enum_member
  (identifier) @name) @definition.constant

; Class methods (functions inside class_body)
(class_body
  (declaration
    (function_decl
      (identifier) @name) @definition.method))
