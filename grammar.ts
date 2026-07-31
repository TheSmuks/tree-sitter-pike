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
    [$.modifier, $.inherit_specifier],
    // this_expr as type vs expression
    [$.this_expr, $.type],
    // this_object standalone vs this_object() form
    [$.this_expr],
    // assign_expr right-recursive ternary ambiguity
    [$.assign_expr],
    // dangling else ambiguity
    [$.if_statement],
    // postfix_expr call-with-block ambiguity (f() {} vs f() as expr) — resolved by dynamic precedence
    // bare identifier as declaration (MUTEX;) vs identifier_expr
    [$.identifier_expr, $.declaration],
    // magic_identifier (keywords-as-identifiers in macro args) vs primary_expr
    [$.primary_expr, $.magic_identifier],
    [$.basic_type, $.magic_identifier],
    [$.string_concat, $._id_expr],
    [$.string_concat, $._id_expr, $.declaration],
    [$.string_concat, $.macro_invocation],
    [$.mapping_literal, $.unary_expr],
    // expression_statement vs macro_invocation_stmt: dynamic precedence
    // resolves this — expression_statement wins for plain expression args.
    [$.identifier_expr, $.macro_invocation, $.macro_invocation_stmt, $.declaration],
    [$.macro_invocation, $.macro_invocation_stmt],
    [$.macro_invocation, $.macro_invocation_stmt, $.declaration],
    [$.macro_argument_list, $.parameter],
    // A macro argument that is exactly `return` is both a keyword passed as a
    // token and a statement whose ';' the expansion supplies; the token after
    // it decides, and `macro_argument_stmts` ranks below on a tie.
    [$.magic_identifier, $.macro_argument_tail_stmt],
    // `F(return a, b` — one `return a, b;` statement whose ';' is still to come,
    // or a `return a` argument followed by a `b` argument. The ';' or ')' tells.
    [$.comma_expr, $.macro_argument_tail_stmt],
    [$.string_concat, $.declaration],
    [$._id_expr, $.declaration],
    [$.identifier_expr, $._id_expr, $.declaration],
    [$.inherit_specifier, $.declaration],
    [$.declaration],
    // preproc conditional fragments: after a branch's comma_expr, the parser
    // forks between finishing the expression and continuing to the next branch
    [$.preproc_conditional_expr, $.comma_expr],
    // macro invocation vs expression statement in block/statement context
    // A bare macro statement opens exactly like every other `IDENT (` form;
    // only the token after the argument list tells them apart, so all four
    // parses must stay alive until then and dynamic precedence ranks them.
    [$.identifier_expr, $.macro_invocation_stmt, $.macro_invocation_bare_stmt, $.macro_statement],
    [$.macro_invocation_stmt, $.macro_invocation_bare_stmt],
    [$.macro_invocation_bare_stmt, $.macro_statement],
    [$.identifier_expr, $.macro_invocation, $.macro_invocation_stmt],
    [$.identifier_expr, $.macro_invocation_stmt],
  ],


  // External scanner tokens. See docs/scanner-design.md §10 for the
  // post-design analysis explaining why PREPROC_BLOCK was dropped.
  externals: $ => [
    $.hash_string,
    // #define body tokens. The scanner owns them because all three depend on
    // information the LR lexer cannot see: whether a paren abuts the macro
    // name, and whether the line has ended. See `preproc_define`.
    $._preproc_params_open,
    $._preproc_chunk,
    $._preproc_line_end,
    // Never used by any rule. Tree-sitter marks every external token valid at
    // once during error recovery, so this is the scanner's only way to tell
    // "the parser wants a #define token here" from "the parser is guessing".
    $._preproc_error_sentinel,
  ],
  // Extras: whitespace + line continuations treated as skippable inter-token
  // material, following tree-sitter-c's approach. The regex in extras makes
  // backslash-newline invisible to every rule. Correct for both normal code
  // (Pike supports line continuation) and preprocessor directives (the
  // preprocessor_directive token regex explicitly spans continuations).
  extras: $ => [
    /\s|\\\r?\n/,
    $.autodoc_comment,
    $.line_comment,
    $.block_comment,
    $.preproc_include,
    $.preproc_define,
    $.preproc_if,
    $.preproc_endif,
    $.preproc_undef,
    $.preprocessor_directive,
    $.preproc_branch,
    $.shebang,
  ],

  word: $ => $.identifier,

  rules: {
    program: $ => repeat($._definition),

    _definition: $ => choice(
      $.declaration,
      // Dynamic precedence ensures expression_statement wins over
      // macro_invocation_stmt when both can match (plain expression args).
      // When args contain type expressions, argument_list cannot parse them,
      // so macro_invocation_stmt wins naturally.
      prec.dynamic(1, $.expression_statement),
      $.block,
      ';',
      // Top-level macro invocation with trailing ';'.
      // Handles bare macro calls like CBFUNC(function(mixed|void:int), x);
      // where arguments include type expressions that regular argument_list
      // cannot parse. Only matches when expression_statement fails (type args).
      $.macro_invocation_stmt,
      // Statement keywords at top level. Pike rejects these at file scope,
      // but including them here lets tree-sitter parse them correctly (as
      // if_statement, while_statement, etc.) instead of falling back to
      // macro_invocation with the keyword as an identifier callee. This is
      // important for ast-grep pattern matching and downstream tooling.
      $.if_statement,
      $.while_statement,
      $.do_while_statement,
      $.for_statement,
      $.foreach_statement,
      $.switch_statement,
      $.return_statement,
      $.break_statement,
      $.continue_statement,
      $.labeled_statement,
    ),

    line_comment: _ => token(seq('//', /[^!\n].*|/)),
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

    // `\` before a newline splices, so a string literal may span lines:
    // `pike -e 'write("%O", "a\<newline>b")'` prints "ab". The explicit
    // alternative is needed because tree-sitter's `.` excludes newline.
    string_literal: _ => token(
      seq('"', repeat(choice(/[^"\\]/, /\\\r?\n/, /\\./)), '"')
    ),

    // Hash-string #"..." — tokenized by the external scanner (src/scanner.c).
    // The rule body is a placeholder; tree-sitter replaces it with the external token.
    hash_string: _ => token(seq('#', /[ \t]*/, '"', repeat(choice(/[^"\\]/, /\\./)), '"')),

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
      // A function-like macro may sit between literals too, as long as it
      // expands to a string: `"<tr " BODY_TR_ATTRS (row) ">"`.
      seq($.string_literal, repeat1(choice($.string_literal, $.hash_string, $.identifier, $.macro_invocation))),
      seq($.hash_string, repeat1(choice($.string_literal, $.hash_string, $.identifier, $.macro_invocation))),
      seq($.identifier, $.string_literal, repeat(choice($.string_literal, $.hash_string, $.identifier))),
      // Identifier followed by macro_invocation: DEC_COMB_MARK GR("")
      // Handles implicit concatenation of macro-expanded string literals.
      // Uses macro_invocation (not postfix_expr) to avoid conflict with function calls.
      seq($.identifier, $.macro_invocation, repeat(choice($.string_literal, $.hash_string, $.identifier, $.macro_invocation))),
    ),


    identifier: _ => /[a-zA-Z_\p{L}][a-zA-Z0-9_\p{L}\p{N}]*/,

    // #string "filename" — Pike's file-contents-as-string literal.
    // Reads the named file and evaluates to its contents as a string.
    // Appears in expression position: constant text = #string "gpl.txt";
    // Pike accepts horizontal whitespace between '#' and 'string'
    // (`# string "gpl.txt"`), matching the other preprocessor directives.
    string_include: $ => seq(token(seq('#', /[ \t]*/, 'string')), $.string_literal),
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

    _expr: $ => choice($.comma_expr, $.preproc_conditional_expr),

    // A single expression whose value is chosen at compile time by a
    // preprocessor conditional (`#if A ... #else B ... #endif`). In source all
    // branches are physically present, glued by #else/#elif directives; we
    // parse them as sibling `branch` fragments. Placed at the `_expr` boundary
    // so it covers every position that accepts a full expression (declaration
    // initializers, arguments, return values, if/while conditions) without
    // recursing into the operator-precedence chain. Negative dynamic
    // precedence: a plain (unsplit) expression always wins when it can match.
    preproc_conditional_expr: $ => prec.dynamic(-1, seq(
      field('branch', $.comma_expr),
      repeat1(seq($.preproc_branch, field('branch', $.comma_expr))),
    )),

    // Left-recursive for unlimited chaining: a, b, c, d
    comma_expr: $ => choice(
      $.assign_expr,
      prec.left(seq($.comma_expr, ',', $.assign_expr)),
    ),

    assign_expr: $ => choice(
      $.cond_expr,
      seq($.cond_expr, $._assign_op, $._assign_rhs),
      seq($.array_destructure, $._assign_op, $._assign_rhs),
    ),

    // The right-hand side of an assignment, which is the one place a class
    // expression may be named. See _class_value.
    _assign_rhs: $ => choice($.assign_expr, $._class_value),

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
      // Dynamic precedence: expression_statement wins over macro_invocation_stmt
      // for ordinary calls. When an argument is a statement (e.g. an if-clause
      // passed to a control-flow macro), argument_list cannot parse it, so
      // macro_invocation_stmt wins naturally. Mirrors the _definition handling.
      prec.dynamic(1, $.expression_statement),
      $.macro_invocation_stmt,
      $.macro_invocation_bare_stmt,
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

    // Declaration-in-condition: `if (Type var = expr)`, `while (Type var)`.
    //
    // Pike does not special-case this per statement. `comma_expr` itself has
    // `simple_type2 local_name_list` (language.yacc), so a declaration is legal
    // in every position that takes a comma expression — the conditions of if,
    // while and for, and switch's value.
    //
    // The initializer is optional for the same reason: `local_name_list` does
    // not require one. `for (keys; string key;)` in the Roxen corpus is exactly
    // that — and worth knowing that it compiles to a loop which never runs,
    // since an uninitialised declaration evaluates to 0. Pike accepts it with
    // only an unused-variable warning. Verified against pike v8.0.1116:
    // `if (string x)`, `while (string x)` and `for (0; string k;)` all compile.
    cond_decl: $ => seq(
      field('type', $.type), field('name', $.identifier),
      optional(seq('=', field('value', $._expr))),
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
      optional(field('initializer', choice($._expr, $.for_init_decl))), ';',
      optional(field('condition', choice($._expr, $.cond_decl))), ';',
      optional(field('update', $._expr)),
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


    typed_lvalue: $ => seq(field('type', $.type), field('name', $.identifier)),

    _foreach_lvalue: $ => choice(
      $._expr,
      $.typed_lvalue,
      $.array_destructure,
    ),

    switch_statement: $ => seq('switch', '(', field('value', choice($._expr, $.cond_decl)), ')', field('body', $.block)),

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
    macro_invocation_stmt: $ => seq(
      field('name', $.identifier),
      field('arguments', $.macro_argument_list),
      ';',
    ),

    // A macro whose expansion carries its own terminator is written without
    // one, so the invocation is a whole statement on its own:
    //   SERVER_DEBUG("received_content_length - !headers")   (proxy.pike)
    //   CASE_ASSIGN(browser_timeout)   → `case "…": … break;`
    //   LOG_HANDLE_END()               → a do/while, or nothing at all
    // Ranked below every other statement that could start the same way, so an
    // ordinary call, declaration or paired begin/end macro is never re-read as
    // this; it only wins where nothing else can complete.
    macro_invocation_bare_stmt: $ => prec.dynamic(-2, seq(
      field('name', $.identifier),
      field('arguments', choice($.macro_argument_list, $.macro_empty_argument_list)),
    )),

    // Macro arguments can be expressions, types, blocks, or a sequence of
    // statements. Statement arguments arise when a macro expands to control
    // flow, e.g.
    //   RUN_MAYBE_BLOCKING(cond, 0, 1, SSL3_DEBUG_MSG("…"); return 0;)
    //   IF_ELSE_PAGED_SEARCH(if (…) { … },)
    // A plain expression argument (no trailing `;`) still parses as `_expr`;
    // `macro_argument_stmts` only wins when the argument contains statements.
    macro_argument_list: $ => seq('(', trailingCommaSep1(choice($._expr, $.type, $.block, $.macro_argument_stmts, $.magic_identifier, $.macro_argument_fragment, seq($.type, $.identifier))), ')'),

    // An empty list stays out of `macro_argument_list` itself: allowing it
    // there makes `int foo();` a macro invocation as readily as a function
    // prototype, and the two are indistinguishable at that point. Only the
    // bare statement form takes it, where no prototype can appear.
    macro_empty_argument_list: _ => seq('(', ')'),

    // An argument that is only half an expression, completed by whatever the
    // expansion splices it onto:
    //   "…unparsed" DO_IF_DEBUG (+ sprintf (" (with new %O…", …))
    // Ranked below `_expr` so `(-x)` stays unary negation rather than becoming
    // a fragment; only a leading operator no unary rule accepts reaches here.
    macro_argument_fragment: $ => prec.dynamic(-1, seq(
      choice('+', '-', '*', '/', '%', '|', '&', '^', '<<', '>>',
             '==', '!=', '<', '>', '<=', '>=', '&&', '||'),
      $._expr,
    )),

    // Covers the real cases:
    //   if (…) { … } else RETURN(0);   and   MSG("…"); return 0;
    //   ISIP(ip, mixed foo; if (foo = …) return foo; … return foo;)
    //
    macro_argument_stmts: $ => prec.dynamic(-1, choice(
      repeat1($._macro_argument_stmt),
      seq(repeat($._macro_argument_stmt), $.macro_argument_tail_stmt),
    )),

    _macro_argument_stmt: $ => choice(
      $.if_statement,
      $.return_statement,
      $.break_statement,
      $.continue_statement,
      $.expression_statement,
      $.macro_invocation_stmt,
      $.macro_argument_decl,
    ),

    // The last statement of an argument may have no ';' — the expansion
    // supplies it. `#define ISIP(H,CODE) do { … {CODE;} … }` is called as
    // `ISIP(host, return host)` and as `ISIP(host, callback(host,@args);return)`.
    //
    // The returned value is an `assign_expr`, not `_expr`: the preprocessor
    // splits arguments on top-level commas, so `F(a, return b, c)` passes three
    // arguments and the comma after `b` is not part of the return value.
    // Only `return`: a bare `break` or `continue` argument is already a
    // `magic_identifier`, and offering both makes every such argument ambiguous.
    macro_argument_tail_stmt: $ => seq('return', optional(field('value', $.assign_expr))),

    // A declaration inside a statement argument, e.g.
    //   ISIP(ip, mixed foo; if (foo = cache_lookup(…)) return foo; … )
    //
    // Deliberately NOT `local_declaration`: that rule declares several names at
    // once, and its comma makes `F(int x, y` ambiguous with both the argument
    // list's own comma and an expression argument, cascading into conflicts
    // between `local_declaration` and `identifier_expr`, `_id_expr` and
    // `primary_expr` — GLR ambiguity spread across the whole expression
    // grammar to buy a form no corpus file uses. One declarator needs only the
    // conflict that `type identifier` already has with a parameter list.
    // No initializer: `_expr` reaches `comma_expr`, so `F(mixed id = a, b, c)`
    // would read the argument separators as part of the initializer and then
    // demand a ';' that is not there. The corpus wants only the bare form.
    macro_argument_decl: $ => seq(
      field('type', $.type),
      field('name', $.identifier),
      ';',
    ),

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
    _function_type: $ => choice(
      seq(
        '(',
        optional(trailingCommaSep1($.type)),
        optional('...'),
        ':', $.type,
        ')',
      ),
      // A macro can stand in for the whole signature — Roxen's
      // `function(DEFVAR) defvar` with `#define DEFVAR mixed...:object`.
      // Without the ':' there is no signature here for the branch above.
      seq('(', field('macro', $.identifier), ')'),
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

    declaration: $ => choice(
      $.modifier_block,
      seq(
        repeat($.modifier),
        optional($.attribute),
        choice(
          // Same dynamic precedence as variable_decl below, for the same reason:
          // a prototype (`Dog getDog();`) otherwise splits into a bare-identifier
          // declaration (`Dog`) plus an expression_statement (`getDog();`), which
          // wins on expression_statement's prec.dynamic(1). Prototypes are legal
          // Pike, so a complete `type name(params);` must win.
          prec.dynamic(2, $.function_decl),
          // Outranks the `_definition` split of `Greeter g = Greeter("x");` into
          // a bare-identifier declaration (`Greeter`) plus an expression_statement
          // (`g = Greeter("x");`). That split wins on dynamic precedence alone —
          // expression_statement carries prec.dynamic(1) to beat
          // macro_invocation_stmt — so any file-scope or class-body variable with
          // a user-defined type parsed as an assignment to an undeclared name.
          // Pike accepts `Greeter g = Greeter("World");` at file scope; a
          // complete `type name [= value];` must win. 2 > 1 keeps
          // expression_statement ahead of macro_invocation_stmt as intended.
          prec.dynamic(2, $.variable_decl),
          $.constant_decl,
          $.class_decl,
          $.enum_decl,
          $.typedef_decl,
          $.import_decl,
          $.inherit_decl,
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
    ),

    // `private { … }` — a modifier applied to a group of definitions, not a
    // statement block. Pike's `modifiers '{' program '}'` production
    // (language.yacc) puts a *program* between the braces, so the body holds
    // declarations: `private { string v; protected class Inner { int y; } }`
    // compiles, while `private { (int)1.5; }` does not — statements are
    // rejected there. Modelling the body as `block` (a statement list) made a
    // nested `protected class Inner` parse as `modifier type identifier`, and
    // the parser then demanded the `;` that DBManager.pmod does not have.
    //
    // At least one modifier is required. That is what keeps the rule
    // deterministic: a brace at declaration position with no modifier in front
    // still belongs to `block`, so this rule never competes with it and no
    // conflict entry is needed for the brace itself.
    modifier_block: $ => seq(
      repeat1($.modifier),
      '{',
      // `block` is here because Pike's `program` admits a bare `{ … }` group of
      // its own — `private { { int x; } }` compiles.
      repeat(choice($.declaration, $.block, ';')),
      '}',
    ),

    // __attribute__("name") as declaration modifier
    attribute: $ => seq('__attribute__', '(', $.string_literal, ')'),

    modifier: $ => choice(
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
      repeat($.modifier),
      field('type', choice($.type, $.macro_invocation)), optional('...'), optional(field('name', $.identifier)),
      optional(seq('=', field('default_value', $._expr))),
    ),

    variable_decl: $ => seq(
      field('type', $.type), commaSep1(seq(
        field('name', choice($.identifier, $.backtick_identifier)),
        optional(seq('=', field('value', choice($._expr, $._class_value)))),
      )),
      ';',
    ),

    local_declaration: $ => seq(
      repeat($.modifier),
      field('type', $.type), commaSep1(seq(
        field('name', choice($.identifier, $.backtick_identifier)),
        optional(seq('=', field('value', choice($._expr, $._class_value)))),
      )),
      ';',
    ),

    local_function_decl: $ => seq(
      repeat($.modifier),
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

    // A class expression that carries a name.
    //
    // Pike has one class production — `class: TOK_CLASS line_number_info
    // optional_identifier` (language.yacc) — reached from expression position
    // via `expr4: … | implicit_modifiers class`, so a name there is as valid as
    // its absence. It is NOT modelled by adding an optional name to
    // anon_class, though, because that makes `class Foo { … }` ambiguous with
    // class_decl everywhere a declaration is legal. That ambiguity is not
    // resolvable by precedence here: tree-sitter settles it statically, so
    // neither prec.dynamic on class_decl nor on anon_class changes the parse,
    // and the expression reading wins — it then completes by running through
    // preproc_conditional_expr into an `#else` branch and consuming the
    // semicolon of the following declaration.
    //
    // So the named form is reachable only from _class_value, and _class_value
    // only after `=`. A statement can never start there, which is exactly the
    // position where `class Foo { … }` must stay a declaration.
    //
    // `optional_identifier` is TOK_IDENTIFIER only, so unlike class_decl this
    // does not admit a backtick identifier.
    named_class_expr: $ => seq(
      'class', field('name', $.identifier),
      optional($.generic_bindings),
      optional($.parameters),
      field('body', $.class_body),
    ),

    // A named class used as a value: either the class itself, or an instance
    // of it. The Roxen corpus uses both forms, and they do not mean the same
    // thing — `= class Foo { … }` binds a program, `= class Foo { … }()` binds
    // an object — so instantiation gets its own node rather than vanishing
    // into an anonymous sequence.
    _class_value: $ => choice($.named_class_expr, $.class_instantiation),

    class_instantiation: $ => seq(
      field('class', $.named_class_expr),
      '(', optional(field('arguments', $.argument_list)), ')',
    ),

    // `block` is an alternative here for the same reason as in modifier_block:
    // a class body is a `program`, and `class C { { int x; } }` compiles.
    class_body: $ => seq('{', repeat(choice($.declaration, $.block, ';')), '}'),

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
      repeat($.modifier), 'typedef', field('type', $.type), field('name', $.identifier), ';',
    ),

    import_decl: $ => seq(
      repeat($.modifier), 'import', field('path', choice($._expr, $.string_literal)), ';',
    ),

    inherit_decl: $ => seq(
      repeat($.modifier), 'inherit', field('path', choice($._expr, $.string_literal)),
      optional(seq(':', field('alias', choice($.identifier, $.string_literal)))),
      ';',
    ),

    // Structured #include directive with named path field.
    // Supports both quoted and angle-bracket includes:
    //   #include "foo.pike"
    //   #include <bar.h>
    // Placed in extras so it can appear anywhere (like preprocessor_directive).
    preproc_include: $ => seq(
      '#', /\s*/, 'include', /\s+/,
      field('path', choice($.string_literal, $.system_lib_string)),
    ),

    // Angle-bracket include path: <foo.h>
    // Used by #include <...> for system/standard headers.
    system_lib_string: _ => token(seq('<', repeat(/[^>]/), '>')),

    // Structured #define. Modelled rather than swallowed as one token so that
    // identifiers inside a macro body are real nodes at real positions —
    // hover, go-to-definition, completion and references are all position
    // lookups, so with an opaque directive token they can answer nothing
    // anywhere inside a macro.
    //
    // Also an `extra`, so a #define stays invisible to every surrounding rule
    // exactly as the opaque token was.
    preproc_define: $ => seq(
      '#', /\s*/, 'define', /\s+/,
      field('name', $.identifier),
      optional(field('parameters', $.preproc_params)),
      optional(field('body', $.preproc_body)),
      $._preproc_line_end,
    ),

    // Only a paren that abuts the name makes the macro function-like:
    // `#define F(X) …` takes a parameter, `#define F (X) …` has body `(X)`.
    // The distinction is whitespace the LR lexer has already skipped by the
    // time it picks a token, so the scanner decides it instead.
    preproc_params: $ => seq(
      $._preproc_params_open,
      commaSep(field('parameter', $.preproc_param)),
      ')',
    ),

    preproc_param: $ => choice(
      seq(field('name', $.identifier), optional('...')),
      '...',
    ),

    // A permissive token sequence, deliberately not an expression or a
    // statement: a macro body need not be either. `#define DO_IF_DEBUG(X) X`,
    // `#define BODY_TR_ATTRS "class=x"` and bodies that stop mid-expression
    // are all ordinary Pike. Everything that is not an identifier, a literal
    // or a comment collapses into hidden chunk tokens, which leaves the body
    // unparsed but keeps the parts tooling resolves individually addressable.
    preproc_body: $ => repeat1($._preproc_body_token),

    _preproc_body_token: $ => choice(
      $.identifier,
      $.integer_literal,
      $.float_literal,
      $.char_literal,
      $.string_literal,
      $.backtick_identifier,
      // Spelled out because the scanner hands a slash back to the LR lexer, so
      // that `//` and `/*` still win over division by being the longer match.
      '/',
      $._preproc_chunk,
    ),

    // Preprocessor directive token spanning continuation lines.
    // Regex (\\\n|\\[^\n]|[^\\\n])* handles: line continuation,
    // escape sequences, and plain chars.
    // Whitespace between # and directive keyword is allowed (Pike lexer accepts it).
    // Note: #include, #define and the conditional directives are handled
    // separately, by rules that give them structured children.
    preprocessor_directive: _ => token(choice(
      seq('#', /\s*/, 'pike', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'charset', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'pragma', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'require', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'warning', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'error', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
    )),

    // The conditional directives, structured for the same reason `#define` is:
    // a condition is where the names that decide what compiles are written, and
    // an opaque token gives them no position. In the Roxen corpus 2316
    // identifier occurrences sit inside these lines — `ENABLE_DUMPING`,
    // `constant(...)`, `defined(...)` — and no position-driven capability could
    // answer at any of them.
    //
    // They stay `extras`, exactly as the opaque tokens were: a conditional
    // region is NOT a subtree, both branches are still spliced into one stream.
    //
    // Making it one — `preproc_if repeat(_stmt) (preproc_branch repeat(_stmt))*
    // preproc_endif` as a `_stmt` alternative — was measured and rejected. The
    // Roxen corpus went from 5 failing files of 442 to 145. An extra keeps its
    // implicit skip only in states that have no explicit action for it, so
    // adding the rule removes the fallback at exactly the position that needs
    // it: 54 of the corpus's 1698 regions open a brace they do not close
    // (`#ifdef D` … `timer = gauge {` … `#endif`), and each one becomes an
    // ERROR. Adding a stray-directive escape hatch with declared conflicts
    // recovers part of it — 119 failing, still 114 regressions.
    //
    // The motivating file cannot be fixed this way in any case.
    // roxen_master.pike:676 puts an `if (…)` header in the `#ifdef` branch and
    // its body after the `#endif`; no tree in which each branch is a complete
    // statement list describes it, and the structural grammar turns the whole
    // file into one ERROR where the spliced one localises the damage.
    //
    // The condition reuses `preproc_body` rather than the expression grammar. A
    // `#if` condition is preprocessor syntax, not Pike: `constant(X)` and
    // `defined(X)` are preprocessor operators, and a condition may be spelled
    // with macros that expand to anything. The permissive form surfaces the
    // identifiers, which is what tooling asks for, without inventing a parse.
    preproc_if: $ => seq(
      '#', /\s*/,
      choice(
        seq('if', optional(field('condition', $.preproc_body))),
        // `#ifdef`/`#ifndef` take exactly one name; it gets a field of its own
        // so a lookup does not have to reach through a body. Anything after it
        // is still absorbed, because a directive must never fail to parse.
        seq(choice('ifdef', 'ifndef'), field('name', $.identifier), optional($.preproc_body)),
      ),
      $._preproc_line_end,
    ),

    preproc_endif: _ => seq('#', /\s*/, 'endif'),

    // `#undef` names a macro, so its argument is a reference like any other.
    preproc_undef: $ => seq('#', /\s*/, 'undef', field('name', $.identifier), $._preproc_line_end),

    // Branch-separator directives (#else/#elif/#elseif/#elifdef/#elifndef).
    // Also an `extra` (so statement-level use is invisible), but ADDITIONALLY
    // referenced explicitly by `preproc_conditional_expr` as visible glue, so
    // that a conditional splitting a single *expression* into alternative
    // fragments (`x = #if A ... #else B ... #endif`) parses as one expression.
    //
    // Deliberately still ONE token, unlike its `#if` counterpart. Being visible
    // glue is what forbids the split: as a rule its first token is a bare '#',
    // which at an expression boundary is also the start of every directive
    // extra, and the parser takes the extra route — the whole declaration
    // becomes an ERROR. As a token it out-matches '#' by length wherever the
    // glue is expected, and elsewhere the extras still win. The structure would
    // buy 9 `#elif` directives in the whole Roxen corpus; `#else`, the other 379,
    // carries no condition to structure.
    preproc_branch: _ => token(choice(
      seq('#', /\s*/, 'elif', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'elseif', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'elifdef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'elifndef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
      seq('#', /\s*/, 'else', /[^\S\r\n]*/),
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