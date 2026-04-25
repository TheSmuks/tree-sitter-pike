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
    // assign_expr right-recursive ternary ambiguity
    [$.assign_expr],
    // dangling else ambiguity
    [$.if_statement],
  ],
  externals: $ => [],

  extras: $ => [
    /\s+/,
    $.line_continuation,
    $.line_comment,
    $.block_comment,
    $.autodoc_comment,
    $.preprocessor_directive,
  ],

  word: $ => $.identifier,

  rules: {
    program: $ => repeat($._definition),

    _definition: $ => choice(
      $.declaration,
      $.expression_statement,
      $.block,
      ';',
    ),

    line_comment: _ => token(seq('//', /.*/)),
    block_comment: _ => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),  
    autodoc_comment: _ => token(seq('//!', /.*/)),
    line_continuation: _ => /\\[\r\n]+/,

    // ── Literals ──

    integer_literal: _ => token(choice(
      seq('0x', /[0-9a-fA-F]+/),
      seq('0b', /[01]+/),
      seq('0', /[0-7]+/),
      /[0-9]+/,
    )),

    char_literal: _ => token(seq("'", choice(/[^'\\]/, /\\./), "'")),

    float_literal: _ => token(
      /[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?|[0-9]+[eE][+-]?[0-9]+|\.[0-9]+([eE][+-]?[0-9]+)?/
    ),

    string_literal: _ => token(choice(
      seq('"', repeat(choice(/[^"\\]/, /\\./)), '"'),
      seq('#"', repeat(/[^\x22]/), '"'),
    )),

    // Adjacent string concatenation: "hello" "world" -> "helloworld"
    string_concat: $ => seq($.string_literal, repeat1($.string_literal)),

    identifier: _ => /[a-zA-Z_][a-zA-Z0-9_]*/,
    // Backtick identifiers: `foo, `+, `->, `[], `[]=, `(), `[..], `->foo, `->foo=
    // Known limitation: `foo= (setter) form requires external scanner
    backtick_identifier: _ => token(choice(
      /`[a-zA-Z_][a-zA-Z0-9_]*/,
      '`[]', '`[]=', '`()', '`->', '`->=', '`[..]',
      /`[-+&|^*\/~%!=<>]+/,
      seq('`', '->', /[a-zA-Z_][a-zA-Z0-9_]*/, optional('=')),
    )),

    // ── Collection literals ──

    array_literal: $ => seq('(', '{', optional(trailingCommaSep1(choice($._expr, seq('@', $._expr)))), '}', ')'),
    mapping_literal: $ => seq('(', '[', optional(trailingCommaSep1($.mapping_pair)), ']', ')'),
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
      seq($.postfix_expr, '->', choice($.identifier, $.magic_identifier)),
      // Safe arrow: obj->?field
      seq($.postfix_expr, '->?', choice($.identifier, $.magic_identifier)),
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
    ),

    identifier_expr: $ => field('name', $.identifier),

    argument_list: $ => trailingCommaSep1(choice($._expr, seq('@', $._expr))),

    // Cast takes unary_expr to allow (int)!x, (string)-y etc.
    cast_expr: $ => seq('(', field('type', $.type), ')', field('value', $.unary_expr)),

    soft_cast_expr: $ => prec(1, seq('[', field('type', $.type), ']', field('value', $.unary_expr))),

    catch_expr: $ => seq('catch', field('value', $._catch_arg)),
    gauge_expr: $ => seq('gauge', field('value', $._catch_arg)),

    _catch_arg: $ => choice(seq('(', $._expr, ')'), $.block),
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
      seq($.version_prefix, '::'),
      seq($.inherit_specifier, choice($.identifier, $.string_literal), '::'),
      '::',
    ),

    version_prefix: _ => token(/[0-9]+\.[0-9]+/),

    this_expr: $ => choice('this', 'this_program', seq('this_object', '(', ')')),

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
      'predef', 'bits',
    ),

    generic_bindings: $ => seq('(<', commaSep1($.type), '>)'),

    // ── Statements ──

    _stmt: $ => choice(
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
    ),

    block: $ => seq('{', repeat($._stmt), '}'),

    expression_statement: $ => seq($._expr, ';'),

    if_statement: $ => seq(
      'if', '(', field('condition', $._expr), ')', field('consequence', $._stmt),
      optional(seq('else', field('alternative', $._stmt))),
    ),

    while_statement: $ => seq('while', '(', field('condition', $._expr), ')', field('body', $._stmt)),
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
      seq(',', field('value', $._foreach_lvalue)),
      seq(';', optional(field('key', $._foreach_lvalue)), ';', optional(field('value', $._foreach_lvalue))),
    ),

    _foreach_lvalue: $ => choice(
      $._expr,
      seq($.type, $.identifier),
      $.array_destructure,
    ),

    switch_statement: $ => seq('switch', '(', field('value', $._expr), ')', $.block),

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

    _int_range_val: $ => choice($.integer_literal, seq('-', $.integer_literal)),

    _mapping_type: $ => seq('(', $.type, ':', $.type, ')'),

    // trailing comma before '...' allowed: function(int, string, ...:void)
    // Note: function(:void) zero-param form produces a MISSING node due to
    // tree-sitter GLR exploring $.type at ':' position — known limitation
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

    parameters: $ => seq('(', optional(commaSep1($.parameter)), ')'),

    parameter: $ => seq(
      field('type', $.type), optional('...'), optional(field('name', $.identifier)),
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
      field('type', $.type), commaSep1(seq(
        field('name', choice($.identifier, $.backtick_identifier)),
        optional(seq('=', field('value', $._expr))),
      )),
      ';',
    ),

    constant_decl: $ => seq(
      'constant',
      commaSep1(seq(field('name', $.identifier), '=', field('value', $._expr))),
      ';',
    ),

    class_decl: $ => seq(
      'class', field('name', $.identifier),
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

    class_body: $ => seq('{', repeat($.declaration), '}'),

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

    preprocessor_directive: _ => token(choice(
      seq('#if', /\s/, /.*/),
      seq('#ifdef', /\s/, /.*/),
      seq('#ifndef', /\s/, /.*/),
      seq('#elif', /\s/, /.*/),
      seq('#elifdef', /\s/, /.*/),
      seq('#elifndef', /\s/, /.*/),
      seq('#else', /\s*/),
      seq('#endif', /\s*/),
      seq('#define', /\s/, /.*/),
      seq('#undef', /\s/, /.*/),
      seq('#include', /\s/, /.*/),
      seq('#string', /\s/, /.*/),
      seq('#pike', /\s/, /.*/),
      seq('#charset', /\s/, /.*/),
      seq('#pragma', /\s/, /.*/),
      seq('#require', /\s/, /.*/),
      seq('#warning', /\s/, /.*/),
      seq('#error', /\s/, /.*/),
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
