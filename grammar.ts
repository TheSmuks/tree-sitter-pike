/// <reference types="tree-sitter-cli/dsl" />

// @ts-check
export default grammar({
  name: 'pike',

  conflicts: $ => [
    // identifier used as both expression and type
    [$._id_expr, $.primary_expr],
    [$.identifier_expr, $._id_expr],
    [$.comma_expr, $._expr],
    // repeat-modifier ambiguity (modifiers before declarations)
    [$.typedef_decl],
    [$.inherit_decl],
    [$.import_decl],
    [$.enum_decl, $.anon_enum],
    // _definition vs declaration (block appears in both)
    [$._definition, $.declaration],
    // inherit/import can look like expressions
    [$.primary_expr, $.inherit_decl],
    [$.primary_expr, $.import_decl],
    // modifier vs inherit_specifier ('local')
    [$._modifier, $.inherit_specifier],
    // this_expr as type vs expression
    [$.this_expr, $.type],
    // this_object standalone vs this_object() form
    [$.this_expr],
    // assign_expr right-recursive ternary ambiguity
    [$.assign_expr],
    // dangling else ambiguity
    [$.if_statement],
    // macro_statement vs identifier expression (ENTER(args){} LEAVE;)
    [$.macro_statement, $._id_expr],
    [$.macro_statement, $.identifier_expr],
    [$.macro_statement, $._id_expr, $.identifier_expr],
    // inherit_specifier self-recursion (chained scope: Foo::Bar::)
    [$.inherit_specifier],
    // postfix_expr call-with-block ambiguity (f() {} vs f() as expr)
    [$.postfix_expr],
    // bare identifier as declaration (MUTEX;) vs identifier_expr
    [$.identifier_expr, $.declaration],
    // magic_identifier (keywords-as-identifiers in macro args) vs primary_expr
    [$.primary_expr, $.magic_identifier],
    [$.basic_type, $.magic_identifier],
    [$.string_concat, $._id_expr],
    [$.string_concat, $._id_expr, $.declaration],
    [$.string_concat, $.macro_invocation],
    [$.mapping_literal, $.unary_expr],
    // typed macro invocation vs function_decl: TYPE ID(args)
    [$.identifier_expr, $.macro_invocation],
    [$.macro_argument_list, $.parameter],
    [$.string_concat, $.declaration],
    [$._id_expr, $.declaration],
    [$.identifier_expr, $._id_expr, $.declaration],
    [$.inherit_specifier, $.declaration],
    [$.declaration],
  ],


  // External scanner tokens. See docs/scanner-design.md §10 for the
  // post-design analysis explaining why PREPROC_BLOCK was dropped.
  externals: $ => [
    $.hash_string,
  ],
  // Extras: whitespace + line continuations treated as skippable inter-token
  // material, following tree-sitter-c's approach. The regex in extras makes
  // backslash-newline invisible to every rule. Correct for both normal code
  // (Pike supports line continuation) and preprocessor directives (the
  // preprocessor_directive token regex explicitly spans continuations).
  extras: $ => [
    /\s|\\\r?\n/,
    $.line_comment,
    $.block_comment,
    $.autodoc_comment,
    $.preprocessor_directive,
    $.shebang,
  ],

  word: $ => $.identifier,

  rules: {
    program: $ => repeat($._definition),

    _definition: $ => choice(
      $.declaration,
      $.expression_statement,
      $.block,
      ';',
      // Top-level macro invocation with trailing ';'.
      // Handles bare macro calls like CBFUNC(function(mixed|void:int), x);
      // where arguments include type expressions that regular argument_list
      // cannot parse. Falls back to expression_statement for simple calls
      // where ';' follows and args are plain expressions.
      $.macro_invocation_stmt,
    ),

    line_comment: _ => token(seq('//', /.*/)),
    block_comment: _ => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),  
    autodoc_comment: _ => token(seq('//!', /.*/)),
    shebang: _ => token(seq('#!', /.*/)),

    // ── Literals ──

    integer_literal: _ => token(choice(
      seq('0x', /[0-9a-fA-F]+/),
      seq('0b', /[01]+/),
      seq('0', /[0-7]+/),
      /[0-9]+/,
    )),

    char_literal: _ => token(seq("'", choice(/[^'\\]/, /\\[0-7]{1,3}/, /\\x[0-9a-fA-F]+/, /\\./), "'")),

    float_literal: _ => token(
      /[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?|[0-9]+[eE][+-]?[0-9]+|\.[0-9]+([eE][+-]?[0-9]+)?/
    ),

    string_literal: _ => token(
      seq('"', repeat(choice(/[^"\\]/, /\\./)), '"')
    ),

    // Hash-string #"..." — tokenized by the external scanner (src/scanner.c).
    // The rule body is a placeholder; tree-sitter replaces it with the external token.
    hash_string: _ => token(seq('#"', repeat(choice(/[^"\\]/, /\\./)), '"')),

    // Adjacent string concatenation: "hello" "world" -> "helloworld"
    // String concatenation and macro-string juxtaposition.
    //
    // Pike allows adjacent string concatenation: "hello" "world" -> "helloworld"
    // And macro-string juxtaposition: DRIVERNAME"...", HOST ":", WS"."
    // where the identifier is a preprocessor macro expanding to a string.
    //
    // Must contain at least one string_literal to prevent bare identifier pairs
    // from being misinterpreted (e.g., "Foo x" in cond_decl: if (Foo x = y)).
    //
    // Two forms:
    //   1. string_literal followed by more literals/identifiers: "str" "str" IDENT
    //   2. identifier followed by string_literal (and optionally more): IDENT "str"
    string_concat: $ => choice(
      seq($.string_literal, repeat1(choice($.string_literal, $.hash_string, $.identifier))),
      seq($.hash_string, repeat1(choice($.string_literal, $.hash_string, $.identifier))),
      seq($.identifier, $.string_literal, repeat(choice($.string_literal, $.hash_string, $.identifier))),
      // Identifier followed by macro_invocation: DEC_COMB_MARK GR("")
      // Handles implicit concatenation of macro-expanded string literals.
      // Uses macro_invocation (not postfix_expr) to avoid conflict with function calls.
      seq($.identifier, $.macro_invocation, repeat(choice($.string_literal, $.hash_string, $.identifier, $.macro_invocation))),
    ),


    identifier: _ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    // #string "filename" — Pike's file-contents-as-string literal.
    // Reads the named file and evaluates to its contents as a string.
    // Appears in expression position: constant text = #string "gpl.txt";
    string_include: $ => seq('#string', $.string_literal),
    // Backtick identifiers handle Pike's operator overloading syntax.
    // Single backtick: `foo, `+, `->, `[], `[]=, `(), `[..], `->foo, `->foo=, `foo=
    // Double backtick: ``+ ``| ``* (lvalue operator forms)
    // Triple backtick: ```+ ```| ```* (rvalue operator forms)
    // The lexer (lexer.h L1170) supports up to three backticks followed by operator chars,
    // named identifiers, or structural forms like [] and ().
    backtick_identifier: _ => token(choice(
      // Named: `symbol, `symbol= (setter)
      /`[a-zA-Z_][a-zA-Z0-9_]*=?/,
      // Structural: `[], `[]=, `(), `[..]
      '`[]', '`[]=', '`()', '`[..]',
      // Arrow: `->, `->=, `->symbol, `->symbol=
      '`->', '`->=',
      seq('`', '->', /[a-zA-Z_][a-zA-Z0-9_]*/, optional('=')),
      // Single backtick operator: `+ `- `& `| `^ `* `/ `~ `% `! `= `<> `<< `>>
      /`[-+&|^*\/~%!=<>]+/,
      // Double backtick named: ``symbol, ``symbol=
      /``[a-zA-Z_][a-zA-Z0-9_]*=?/,
      // Double backtick operator: ``+ ``| ``* etc.
      /``[-+&|^*\/~%!=<>]+/,
      // Triple backtick operator: ```+ ```| ```* etc.
      /```[-+&|^*\/~%!=<>]+/,
    )),


    // ── Collection literals ──

    array_literal: $ => seq('(', '{', optional(trailingCommaSep1(choice($._expr, seq('@', $._expr)))), '}', ')'),
    mapping_literal: $ => prec(2, seq('(', '[', optional(trailingCommaSep1(choice($.mapping_pair, $.postfix_expr))), ']', ')')),
    multiset_literal: $ => seq('(<', optional(trailingCommaSep1($._expr)), '>)'),

    mapping_pair: $ => seq(field('key', $._expr), ':', field('value', $._expr)),

    // ── Expression hierarchy ──

    _expr: $ => $.comma_expr,

    // Left-recursive for unlimited chaining: a, b, c, d
    comma_expr: $ => choice(
      $.assign_expr,
      prec.left(seq($.comma_expr, ',', $.assign_expr)),
    ),

    assign_expr: $ => choice(
      $.cond_expr,
      seq($.cond_expr, $._assign_op, $.assign_expr),
      seq($.array_destructure, $._assign_op, $.assign_expr),
    ),

    array_destructure: $ => seq('[', commaSep1(choice($._expr, seq($.type, $.identifier), $.array_destructure)), ']'),

    _assign_op: _ => choice(
      '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
      '<<=', '>>=',
    ),

    cond_expr: $ => choice(
      $.lor_expr,
      seq(field('condition', $.lor_expr), '?', field('consequence', $.comma_expr), ':', field('alternative', $.assign_expr)),
    ),

    lor_expr: $ => choice(
      $.land_expr,
      prec.left(seq($.lor_expr, '||', $.land_expr)),
    ),

    land_expr: $ => choice(
      $.bitor_expr,
      prec.left(seq($.land_expr, '&&', $.bitor_expr)),
    ),

    bitor_expr: $ => choice(
      $.bitxor_expr,
      prec.left(seq($.bitor_expr, '|', $.bitxor_expr)),
    ),

    bitxor_expr: $ => choice(
      $.bitand_expr,
      prec.left(seq($.bitxor_expr, '^', $.bitand_expr)),
    ),

    bitand_expr: $ => choice(
      $.eq_expr,
      prec.left(seq($.bitand_expr, '&', $.eq_expr)),
    ),

    eq_expr: $ => choice(
      $.rel_expr,
      prec.left(seq($.eq_expr, choice('==', '!='), $.rel_expr)),
    ),

    rel_expr: $ => choice(
      $.shift_expr,
      prec.left(seq($.rel_expr, choice('>', '>=', '<', '<='), $.shift_expr)),
    ),

    shift_expr: $ => choice(
      $.add_expr,
      prec.left(seq($.shift_expr, choice('<<', '>>'), $.add_expr)),
    ),

    add_expr: $ => choice(
      $.mul_expr,
      prec.left(seq($.add_expr, choice('+', '-'), $.mul_expr)),
    ),

    mul_expr: $ => choice(
      $.unary_expr,
      prec.left(seq($.mul_expr, choice('*', '%', '/'), $.unary_expr)),
    ),

    // Unary operators: !, ~, -, @ — self-recursive to allow chaining (!x, !!x, -~x)
    unary_expr: $ => choice(
      $.postfix_expr,
      prec(1, seq('!', $.unary_expr)),
      prec(1, seq('~', $.unary_expr)),
      prec(1, seq('-', $.unary_expr)),
      prec(1, seq('@', $.unary_expr)),
      // Prefix increment/decrement
      prec(1, seq('++', $.postfix_expr)),
      prec(1, seq('--', $.postfix_expr)),
      $.cast_expr,
      $.soft_cast_expr,
    ),

    // Postfix operations: all chaining happens here (arrow, index, call, dot, range, automap, safe-access)
    postfix_expr: $ => choice(
      $.primary_expr,
      // Postfix increment/decrement
      seq($.postfix_expr, choice('++', '--')),
      // Arrow: obj->field
      seq($.postfix_expr, '->', choice($.identifier, $.magic_identifier, $.backtick_identifier)),
      // Safe arrow: obj->?field (new syntax, ->?)
      seq($.postfix_expr, '->?', choice($.identifier, $.magic_identifier, $.backtick_identifier)),
      // Safe arrow: obj?->field (deprecated syntax, ?->)
      seq($.postfix_expr, '?->', choice($.identifier, $.magic_identifier, $.backtick_identifier)),
      // Call: f(args) and f(args) { block }
      seq($.postfix_expr, '(', optional($.argument_list), ')', optional($.block)),
      // Dot access: obj.field
      seq($.postfix_expr, '.', $.identifier),
      // Index: arr[i]
      seq($.postfix_expr, '[', $._expr, ']'),
      // Safe index: arr[?i]
      seq($.postfix_expr, '[?', $._expr, ']'),
      // Range: arr[a..b], arr[..b], arr[a..], arr[<a..<b]
      seq($.postfix_expr, '[',
        optional(choice($._expr, seq('<', $._expr))),
        choice('..', '...'),
        optional(choice($._expr, seq('<', $._expr))),
        ']'),
      // Safe range: arr[?a..b], arr[?..b], arr[?a..]
      seq($.postfix_expr, '[?',
        optional(choice($._expr, seq('<', $._expr))),
        choice('..', '...'),
        optional(choice($._expr, seq('<', $._expr))),
        ']'),
      // Automap: arr[*]
      seq($.postfix_expr, '[', '*', ']'),
      // Generic bindings: f(<int>)
      seq($.postfix_expr, $.generic_bindings),
    ),

    primary_expr: $ => choice(
      $.integer_literal,
      $.float_literal,
      $.char_literal,
      $.string_literal,
      $.string_include,
      $.string_concat,
      $.array_literal,
      $.mapping_literal,
      $.multiset_literal,
      $.identifier_expr,
      $.backtick_identifier,
      seq('.', $.identifier),
      seq('(', $.comma_expr, ')'),
      $.catch_expr,
      $.gauge_expr,
      $.typeof_expr,
      $.sscanf_expr,
      $.lambda_expr,
      $.anon_class,
      $.anon_enum,
      $.scope_expr,
      $.this_expr,
      // global.identifier — resolve in top-level scope
      seq('global', '.', $.identifier),
      '__func__',
      // External scanner: multi-line hash-string #"..."
      $.hash_string,
    ),

    identifier_expr: $ => field('name', $.identifier),

    argument_list: $ => trailingCommaSep1(choice($._expr, seq('@', $._expr), $.block, $.magic_identifier)),

    // Cast takes unary_expr to allow (int)!x, (string)-y etc.
    cast_expr: $ => seq('(', field('type', $.type), ')', field('value', $.unary_expr)),

    soft_cast_expr: $ => prec(1, seq('[', field('type', $.type), ']', field('value', $.unary_expr))),

    catch_expr: $ => seq('catch', field('value', $._catch_arg)),
    gauge_expr: $ => seq('gauge', field('value', $._catch_arg)),

    _catch_arg: $ => choice(seq('(', choice($._expr, $.cond_decl), ')'), $.block),
    typeof_expr: $ => seq('typeof', '(', field('value', $._expr), ')'),

    sscanf_expr: $ => seq(
      'sscanf', '(', field('input', $._expr), ',', field('format', $._expr),
      repeat(seq(',', $._foreach_lvalue)), ')', 
    ),

    lambda_expr: $ => seq(
      'lambda',
      field('parameters', $.parameters),
      field('body', $.block),
    ),


    scope_expr: $ => seq(field('scope', $.inherit_specifier), field('name', choice($.identifier, $.magic_identifier, $.backtick_identifier))),

    inherit_specifier: $ => choice(
      seq(choice($.identifier, $.string_literal), '::'),
      seq('local', '::'),
      seq('this_program', '::'),
      seq('this', '::'),
      seq('global', '::'),
      seq('predef', '::'),
      $.version_prefix,
      seq($.inherit_specifier, choice($.identifier, $.string_literal), '::'),
      '::',
    ),

    version_prefix: _ => token(seq(/[0-9]+/, '.', /[0-9]+/, '::')),

    this_expr: $ => choice('this', 'this_program', 'this_object', seq('this_object', '(', ')')),

    magic_identifier: _ => choice(
      'if', 'else', 'for', 'while', 'do', 'foreach', 'switch',
      'case', 'default', 'break', 'continue', 'return',
      'catch', 'gauge', 'sscanf', 'typeof', 'lambda',
      'class', 'enum', 'typedef', 'inherit', 'import',
      'constant', 'global',
      'void', 'mixed', 'int', 'float', 'string', 'array',
      'mapping', 'multiset', 'object', 'program', 'function',
      'private', 'protected', 'public', 'static', 'extern',
      'inline', 'local', 'final', 'variant', 'optional', 'nomask',
      '__attribute__', '__deprecated__',
      '__func__',
      'predef',
    ),

    generic_bindings: $ => seq('(<', commaSep1($.type), '>)'),

    // ── Statements ──

    _stmt: $ => choice(
      ';',
      // Ellipsis statement: ...; (placeholder/no-op, valid in switch cases)
      seq('...', ';'),
      $.expression_statement,
      $.block,
      $.if_statement,
      $.while_statement,
      $.do_while_statement,
      $.for_statement,
      $.foreach_statement,
      $.switch_statement,
      $.case_clause,
      $.default_clause,
      $.return_statement,
      $.break_statement,
      $.continue_statement,
      $.labeled_statement,
      $.local_declaration,
      // Declarations valid at statement level
      $.constant_decl,
      $.import_decl,
      $.class_decl,
      $.enum_decl,
      $.typedef_decl,
      $.local_function_decl,
      // Macro statement: ENTER(arg) { body } LEAVE;
      // Handles paired begin/end macros that tree-sitter can't expand.
      // See macro_statement rule for full documentation.
      $.macro_statement,
    ),

    block: $ => seq('{', repeat($._stmt), '}'),

    expression_statement: $ => seq($._expr, ';'),

    // Declaration-in-condition: if (Type var = expr) { ... }
    // Yacc allows local declarations in comma_expr (safe_comma_expr).
    // cond_decl is a type+name+initializer alternative to expression conditions.
    cond_decl: $ => seq(
      field('type', $.type), field('name', $.identifier), '=',
      field('value', $._expr),
    ),

    if_statement: $ => seq(
      'if', '(', field('condition', choice($._expr, $.cond_decl)), ')',
      field('consequence', $._stmt),
      optional(seq('else', field('alternative', $._stmt))),
    ),

    while_statement: $ => seq('while', '(', field('condition', choice($._expr, $.cond_decl)), ')', field('body', $._stmt)),
    do_while_statement: $ => seq('do', field('body', $._stmt), 'while', '(', field('condition', $._expr), ')', ';'),

    for_statement: $ => seq(
      'for', '(',
      optional(choice($._expr, $.for_init_decl)), ';', optional(field('condition', $._expr)), ';', optional($._expr),
      ')', field('body', $._stmt),
    ),

    for_init_decl: $ => seq(
      field('type', $.type), commaSep1(seq(field('name', $.identifier), optional(seq('=', field('value', $._expr))))),
    ),

    foreach_statement: $ => seq(
      'foreach', '(', field('iterator', $._expr), $.foreach_lvalues, ')', field('body', $._stmt),
    ),

    foreach_lvalues: $ => choice(
      seq(',', field('key', $._foreach_lvalue), ',', field('value', $._foreach_lvalue)),
      seq(',', field('value', $._foreach_lvalue)),
      seq(';', optional(field('key', $._foreach_lvalue)), ';', optional(field('value', $._foreach_lvalue))),
    ),

    _foreach_lvalue: $ => choice(
      $._expr,
      seq($.type, $.identifier),
      $.array_destructure,
    ),

    switch_statement: $ => seq('switch', '(', field('value', choice($._expr, $.cond_decl)), ')', $.block),

    // case expr: / case expr..expr: / case ..expr: / case expr...expr:
    case_clause: $ => choice(
      seq('case', field('value', $._expr), optional(seq(choice('..', '...'), optional(field('high', $._expr)))), ':'),
      seq('case', choice('..', '...'), field('value', $._expr), ':'),
    ),

    default_clause: $ => seq('default', ':'),

    return_statement: $ => seq('return', optional(field('value', $._expr)), ';'),
    break_statement: $ => seq('break', optional(field('label', $.identifier)), ';'),
    continue_statement: $ => seq('continue', optional(field('label', $.identifier)), ';'),

    labeled_statement: $ => seq(field('label', $.identifier), ':', field('body', $._stmt)),

    // Macro invocation without trailing semicolon.
    // Used inside class bodies (declaration context) where ';' is not required.
    // Macro arguments can include type expressions (function types, union types)
    // that regular argument_list rejects.
    macro_invocation: $ => seq(
      field('name', $.identifier),
      field('arguments', $.macro_argument_list),
    ),

    // Macro invocation with required trailing semicolon.
    // Used at top level (_definition) for IDENTIFIER(type_args);
    // where expression_statement fails because type expressions aren't valid
    // expression arguments. Simple cases like CBFUNC(t, x); are handled by
    // expression_statement instead (regular args parse fine as expressions).
    macro_invocation_stmt: $ => prec.right(1, seq(
      field('name', $.identifier),
      field('arguments', $.macro_argument_list),
      ';',
    )),

    macro_argument_list: $ => seq('(', trailingCommaSep1(choice($._expr, $.type, $.block, $.magic_identifier, seq($.type, $.identifier))), ')'),

    // Macro statement pattern for paired begin/end macros.
    //
    // Pike codebases use C preprocessor macros that expand to balanced
    // constructs, e.g.:  ENTER(0) { ... } LEAVE;
    //   where ENTER(X) -> do {  and  LEAVE -> } while(0);
    //
    // Without macro expansion, tree-sitter sees IDENTIFIER(args) block IDENTIFIER ;
    // and the trailing IDENTIFIER becomes an orphan error node.
    //
    // This rule recognises three patterns:
    //   1. IDENTIFIER(args) block IDENTIFIER ;   — e.g. ENTER(0) { ... } LEAVE;
    //   2. IDENTIFIER block IDENTIFIER ;          — e.g. BEGIN { ... } END;
    //   3. IDENTIFIER(args) block ;               — e.g. RUN_ONCE(x) { ... };
    //
    // Recognised macros are documented in the grammar header so new ones
    // can be added without re-deriving the fix. No token-level rewriting is
    // needed — the grammar simply accepts the pattern as a statement.
    //
    // Field names preserve source positions for downstream tooling.
    // Recognised macros in ssl_file.pike:
    //   ENTER(IN_CALLBACK) { ... } LEAVE;
    //   CHECK_CB_MODE(CUR_THREAD) { ... }
    // Recognised macros in stdio.pmod:
    //   CHECK_OPEN() { ... }
    macro_statement: $ => prec.dynamic(1, choice(
      // IDENTIFIER(args) block IDENTIFIER ;
      seq(
        field('macro', $.identifier),
        field('arguments', $.macro_argument_list),
        field('body', $.block),
        field('end_macro', $.identifier),
        ';',
      ),
      // IDENTIFIER block IDENTIFIER ;
      seq(
        field('macro', $.identifier),
        field('body', $.block),
        field('end_macro', $.identifier),
        ';',
      ),
      // IDENTIFIER(args) block ;
      seq(
        field('macro', $.identifier),
        field('arguments', $.macro_argument_list),
        field('body', $.block),
        ';',
      ),
    )),

    // ── Type system ──

    type: $ => choice(
      $.basic_type,
      prec.left(seq($.type, '|', $.type)),
      $.id_type,
      'this_program',
    ),

    basic_type: $ => choice(
      'float', 'void', 'mixed',
      seq('string', optional($._int_range)),
      seq('int', optional($._int_range)),
      seq('mapping', optional($._mapping_type)),
      seq('function', optional($._function_type)),
      seq('object', optional($._program_type)),
      seq('program', optional($._program_type)),
      seq('array', optional($._array_type)),
      seq('multiset', optional($._multiset_type)),
      seq('__attribute__', '(', $.string_literal, ',', $.type, ')'),
      seq('__deprecated__', '(', $.type, ')'),
    ),

    _int_range: $ => seq('(', choice(
      seq(optional($._int_range_val), '..', optional($._int_range_val)),
      seq('bits', $.integer_literal),
      /[0-9]+bits?/
    ), ')'),

    _int_range_val: $ => choice($.integer_literal, seq('-', $.integer_literal), $.identifier),

    _mapping_type: $ => seq('(', $.type, ':', $.type, ')'),

    // trailing comma before '...' allowed: function(int, string, ...:void)
    // Zero-param form: function(:void), function(:int)
    _function_type: $ => seq(
      '(',
      optional(trailingCommaSep1($.type)),
      optional('...'),
      ':', $.type,
      ')',
    ),
    _program_type: $ => choice(seq('(', $.type, ')'), seq('(', $.string_literal, ')')),

    _array_type: $ => seq('(', $.type, ')'),

    _multiset_type: $ => seq('(', $.type, ')'),

    id_type: $ => $._id_expr,

    _id_expr: $ => choice(
      $.identifier,
      seq($._id_expr, '.', $.identifier),
      $.scope_expr,
      seq('.', $.identifier),
    ),

    // ── Declarations ──

    declaration: $ => seq(
      repeat($._modifier),
      optional($.attribute),
      choice(
        $.function_decl,
        $.variable_decl,
        $.constant_decl,
        $.class_decl,
        $.enum_decl,
        $.typedef_decl,
        $.import_decl,
        $.inherit_decl,
        $.block,
        // Bare macro invocation (no trailing ';'): CBFUNC(t, x)
        $.macro_invocation,
        // Macro invocation with trailing ';': CBFUNC(t, x);
        $.macro_invocation_stmt,
        // Bare identifier as declaration: MUTEX; INHERIT_MUTEX; OVERLOAD_TIMEOFDAY;
        // These are preprocessor macros that expand to declarations or nothing.
        // The grammar accepts them so the tree stays clean.
        // Semicolon is optional because some macros (like MUTEX without threading)
        // expand to nothing — the bare identifier has no trailing ';'.
        seq($.identifier, optional(';')),
        // Typed macro invocation: TYPE IDENTIFIER(args);
        // Handles patterns like: void PROXY(destroy, 0);
        // where TYPE looks like a return type but the "function name" is actually
        // a macro and the args are macro arguments, not typed parameters.
        seq($.type, $.macro_invocation_stmt),
      ),
    ),

    // __attribute__("name") as declaration modifier
    attribute: $ => seq('__attribute__', '(', $.string_literal, ')'),

    _modifier: _ => choice(
      'private', 'protected', 'public', 'static', 'extern',
      'inline', 'local', 'final', 'variant', 'optional', 'nomask',
      '__deprecated__',
    ),

    function_decl: $ => seq(
      field('return_type', $.type), optional('constant'), field('name', choice($.identifier, $.backtick_identifier)),
      field('parameters', $.parameters),
      choice(field('body', $.block), ';'),
    ),

    parameters: $ => seq('(', optional(trailingCommaSep1($.parameter)), ')'),

    parameter: $ => seq(
      repeat($._modifier),
      field('type', choice($.type, $.macro_invocation)), optional('...'), optional(field('name', $.identifier)),
      optional(seq('=', field('default_value', $._expr))),
    ),

    variable_decl: $ => seq(
      field('type', $.type), commaSep1(seq(
        field('name', choice($.identifier, $.backtick_identifier)),
        optional(seq('=', field('value', $._expr))),
      )),
      ';',
    ),

    local_declaration: $ => seq(
      repeat($._modifier),
      field('type', $.type), commaSep1(seq(
        field('name', choice($.identifier, $.backtick_identifier)),
        optional(seq('=', field('value', $._expr))),
      )),
      ';',
    ),

    local_function_decl: $ => seq(
      field('return_type', $.type),
      field('name', choice($.identifier, $.backtick_identifier)),
      field('parameters', $.parameters),
      field('body', $.block),
    ),


    constant_decl: $ => seq(
      'constant',
      commaSep1(seq(field('name', $.identifier), optional(seq('=', field('value', $._expr))))),
      ';',
    ),

    class_decl: $ => seq(
      'class', field('name', choice($.identifier, $.backtick_identifier)),
      optional($.generic_bindings),
      optional($.parameters),
      field('body', $.class_body),
    ),

    anon_class: $ => seq(
      'class',
      optional($.generic_bindings),
      optional($.parameters),
      field('body', $.class_body),
    ),

    class_body: $ => seq('{', repeat(choice($.declaration, ';')), '}'),

    enum_decl: $ => seq(
      'enum', optional(field('name', $.identifier)),
      '{', optional(trailingCommaSep1($.enum_member)), '}',
    ),

    anon_enum: $ => seq(
      'enum', '{', optional(trailingCommaSep1($.enum_member)), '}',
    ),

    enum_member: $ => seq(
      field('name', $.identifier),
      optional(seq('=', field('value', $._expr))),
    ),

    typedef_decl: $ => seq(
      repeat($._modifier), 'typedef', field('type', $.type), field('name', $.identifier), ';',
    ),

    import_decl: $ => seq(
      repeat($._modifier), 'import', field('path', choice($._expr, $.string_literal)), ';',
    ),

    inherit_decl: $ => seq(
      repeat($._modifier), 'inherit', field('path', choice($._expr, $.string_literal)),
      optional(seq(':', field('alias', choice($.identifier, $.string_literal)))),
      ';',
    ),

    // Preprocessor directive token spanning continuation lines.
    // Regex (\\\n|\\[^\n]|[^\\\n])* handles: line continuation,
    // escape sequences, and plain chars. Allows multi-line #define bodies.
    // Whitespace between # and directive keyword is allowed (Pike lexer accepts it).
    preprocessor_directive: _ => token(choice(
      seq('#', /\s*/, 'if', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'ifdef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'ifndef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'elif', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'elseif', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'elifdef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'elifndef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'else', /\s*/),
      seq('#', /\s*/, 'endif', /\s*/),
      seq('#', /\s*/, 'define', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'undef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'include', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'pike', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'charset', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'pragma', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'require', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'warning', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'error', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
    )),
  },
});

function commaSep1(rule: any) {
  return seq(rule, repeat(seq(',', rule)));
}

function commaSep(rule: any) {
  return optional(commaSep1(rule));
}

// Like commaSep1 but allows an optional trailing comma
function trailingCommaSep1(rule: any) {
  return seq(rule, repeat(seq(',', rule)), optional(','));
}