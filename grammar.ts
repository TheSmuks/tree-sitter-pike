/// <reference types="tree-sitter-cli/dsl" />

// @ts-check
export default grammar({
  name: 'pike',

  conflicts: $ => [
    // expression vs declaration ambiguity at statement level
    [$.expression_statement, $.local_declaration],
    // type vs expression in cast context
    [$.type, $._expr],
    // identifier used as both expression and type
    [$._id_expr, $.primary_expr],
    [$.identifier_expr, $._id_expr],
    [$.comma_expr],
    [$.typedef_decl],
    [$.inherit_decl],
    [$.import_decl],
    [$.constant_decl],
    [$.class_decl],
    [$.enum_decl],
    [$.enum_decl, $.anon_enum],
    [$.chain_expr],
    [$.call_expr],
    [$.typeof_expr, $.typeof_type_expr],
    [$.assign_expr],
    [$.if_statement],
    // _definition vs declaration (block appears in both)
    [$._definition, $.declaration],
    // comma_expr left-assoc vs higher precedence
    [$._expr, $.comma_expr],
    // postfix_expr vs dot_expr chaining
    [$.postfix_expr, $.dot_expr],
    // inherit/import can look like expressions
    [$.primary_expr, $.inherit_decl],
    [$.identifier_expr, $.inherit_specifier],
    [$.inherit_specifier, $.this_expr],
    [$.scope_expr, $.inherit_specifier],
    [$.primary_expr, $.import_decl],
    // static_assertion can be declaration or expression
    [$.primary_expr, $.declaration],
    // cast vs parenthesized expression
    [$.cast_expr, $.primary_expr],
    // parameter type vs expression
    [$.parameter, $._expr],
    // modifier vs inherit_specifier ('local')
    [$._modifier, $.inherit_specifier],
  ],

  externals: $ => [],

  extras: $ => [
    /\s/,
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

    // ── Literals ──

    integer_literal: _ => token(choice(
      seq('0x', /[0-9a-fA-F]+/),
      seq('0b', /[01]+/),
      seq('0', /[0-7]+/),
      /[0-9]+/,
    )),

    float_literal: _ => token(
      /[0-9]+\.[0-9]*([eE][+-]?[0-9]+)?|[0-9]+[eE][+-]?[0-9]+|\.[0-9]+([eE][+-]?[0-9]+)?/,
    ),

    string_literal: _ => token(seq('"', repeat(choice(/[^"\\]/, /\\./)), '"')),

    identifier: _ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    backtick_identifier: _ => token(seq('`', /[^ \t\n\r(){}\[\];,."'\\]+/)),

    // ── Collection literals ──

    array_literal: $ => seq('(', '{', optional(commaSep($._expr)), '}', ')'),
    mapping_literal: $ => seq('(', '[', optional(commaSep1($.mapping_pair)), ']', ')'),
    multiset_literal: $ => seq('(<', optional(commaSep1($._expr)), '>)'),

    mapping_pair: $ => seq(field('key', $._expr), ':', field('value', $._expr)),

    // ── Expression hierarchy ──

    _expr: $ => $.comma_expr,

    comma_expr: $ => choice(
      $.assign_expr,
      seq($.assign_expr, ',', $.assign_expr),
    ),

    assign_expr: $ => choice(
      $.cond_expr,
      seq($.cond_expr, $._assign_op, $.assign_expr),
      seq($.array_destructure, '=', $.assign_expr),
    ),

    array_destructure: $ => seq('[', commaSep1($._expr), ']'),

    _assign_op: _ => choice(
      '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
      '<<=', '>>=', '**=', '?=',
    ),

    cond_expr: $ => choice(
      $.lor_expr,
      seq($.lor_expr, '?', $.comma_expr, ':', $.assign_expr),
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

    unary_expr: $ => choice(
      $.power_expr,
      prec(1, seq('!', $.cast_expr)),
      prec(1, seq('~', $.cast_expr)),
      prec(1, seq('-', $.cast_expr)),
      prec(1, seq('+', $.cast_expr)),
    ),

    power_expr: $ => choice(
      $.prefix_expr,
      prec.right(seq($.prefix_expr, '**', $.power_expr)),
    ),

    prefix_expr: $ => choice(
      $.chain_expr,
      seq('++', $.chain_expr),
      seq('--', $.chain_expr),
    ),

    chain_expr: $ => choice(
      $.postfix_expr,
      seq($.chain_expr, '->?', $.magic_identifier),
      seq($.chain_expr, '[?', $._expr, ']'),
      seq($.chain_expr, '[?', optional(choice($._expr, seq('<', $._expr))), '..', optional(choice($._expr, seq('<', $._expr))), ']'),
      seq($.chain_expr, '(?', optional(commaSep($._expr)), ')', optional($.block)),
    ),

    postfix_expr: $ => choice(
      $.primary_expr,
      seq($.postfix_expr, choice('++', '--')),
      seq($.postfix_expr, $.generic_bindings),
    ),

    primary_expr: $ => choice(
      $.integer_literal,
      $.float_literal,
      $.string_literal,
      $.array_literal,
      $.mapping_literal,
      $.multiset_literal,
      $.identifier_expr,
      $.backtick_identifier,
      seq('(', $.comma_expr, ')'),
      $.call_expr,
      $.index_expr,
      $.range_expr,
      $.dot_expr,
      $.arrow_expr,
      $.automap_expr,
      $.cast_expr,
      $.soft_cast_expr,
      $.catch_expr,
      $.gauge_expr,
      $.typeof_expr,
      $.sscanf_expr,
      $.lambda_expr,
      $.generic_selection,
      $.static_assertion,
      $.anon_class,
      $.anon_enum,
      $.scope_expr,
      $.this_expr,
      '__func__',
    ),

    identifier_expr: $ => field('name', $.identifier),

    call_expr: $ => seq(
      field('function', $.postfix_expr),
      '(',
      optional($.argument_list),
      ')',
      optional($.block),
    ),

    argument_list: $ => commaSep1(choice($._expr, seq('@', $._expr))),

    index_expr: $ => seq($.postfix_expr, '[', $._expr, ']'),

    range_expr: $ => seq(
      $.postfix_expr, '[',
      optional(choice($._expr, seq('<', $._expr))), choice('..', '...'), optional(choice($._expr, seq('<', $._expr))),
      ']',
    ),

    dot_expr: $ => seq($.primary_expr, '.', $.identifier),

    arrow_expr: $ => seq($.postfix_expr, '->', choice($.identifier, $.magic_identifier)),

    automap_expr: $ => seq($.postfix_expr, '[', '*', ']'),

    cast_expr: $ => prec(1, seq('(', $.type, ')', $.cast_expr)),

    soft_cast_expr: $ => prec(1, seq('[', $.type, ']', $.cast_expr)),

    catch_expr: $ => seq('catch', $._catch_arg),
    gauge_expr: $ => seq('gauge', $._catch_arg),

    _catch_arg: $ => choice(seq('(', $._expr, ')'), $.block),

    typeof_expr: $ => seq('typeof', '(', $._expr, ')'),

    sscanf_expr: $ => seq(
      'sscanf', '(', $._expr, ',', $._expr,
      repeat(seq(',', $._expr)), ')',
    ),

    lambda_expr: $ => seq(
      optional(choice('__generator__', '__async__')),
      'lambda',
      field('parameters', $.parameters),
      field('body', $.block),
    ),

    generic_selection: $ => seq(
      '_Generic', '(', $._expr, ',',
      commaSep1($.generic_assoc), ')',
    ),

    generic_assoc: $ => seq($.type, ':', $._expr),

    static_assertion: $ => seq(
      '_Static_assert', '(', $._expr, ',', $._expr, ')',
    ),

    scope_expr: $ => seq($.inherit_specifier, choice($.identifier, $.magic_identifier)),

    inherit_specifier: $ => choice(
      seq($.identifier, '::'),
      seq('local', '::'),
      seq('this_program', '::'),
      seq('global', '::'),
      seq('predef', '::'),
      seq($.version_prefix, '::'),
      seq('continue', '::'),
      seq($.inherit_specifier, $.identifier, '::'),
      seq('::', choice($.identifier, $.magic_identifier)),
    ),

    version_prefix: _ => token(/[0-9]+\.[0-9]+/),

    this_expr: $ => choice('this', 'this_program', seq('this_object', '(', ')')),

    magic_identifier: _ => choice(
      'if', 'else', 'for', 'while', 'do', 'foreach', 'switch',
      'case', 'default', 'break', 'continue', 'return',
      'catch', 'gauge', 'sscanf', 'typeof', 'lambda',
      'class', 'enum', 'typedef', 'inherit', 'import',
      'void', 'mixed', 'int', 'float', 'string', 'array',
      'mapping', 'multiset', 'object', 'program', 'function', 'auto',
      'private', 'protected', 'public', 'static', 'extern',
      'inline', 'local', 'final', 'variant', 'optional', 'global', 'nomask',
      '__attribute__', '__deprecated__', '__experimental__',
      '__func__', '__async__', '__generator__', '__generic__',
      '_Generic', '__weak__', '__unused__', '__unknown__',
      'predef', '_Static_assert', 'bits',
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
    ),

    block: $ => seq('{', repeat($._stmt), '}'),

    expression_statement: $ => seq($._expr, ';'),

    if_statement: $ => seq(
      'if', '(', $._expr, ')', $._stmt,
      optional(seq('else', $._stmt)),
    ),

    while_statement: $ => seq('while', '(', $._expr, ')', $._stmt),
    do_while_statement: $ => seq('do', $._stmt, 'while', '(', $._expr, ')', ';'),

    for_statement: $ => seq(
      'for', '(',
      optional($._expr), ';', optional($._expr), ';', optional($._expr),
      ')', $._stmt,
    ),

    foreach_statement: $ => seq(
      'foreach', '(', $._expr, $.foreach_lvalues, ')', $._stmt,
    ),

    foreach_lvalues: $ => choice(
      seq(',', $._expr),
      seq(';', optional($._foreach_lvalue), ';', optional($._foreach_lvalue)),
    ),

    _foreach_lvalue: $ => choice(
      $._expr,
      seq($.type, $.identifier),
    ),

    switch_statement: $ => seq('switch', '(', $._expr, ')', $.block),

    case_clause: $ => seq(
      'case', $._expr,
      optional(seq(choice('..', '...'), optional($._expr))),
      ':',
    ),

    default_clause: $ => seq('default', ':'),

    return_statement: $ => seq(optional(choice('break', 'continue')), 'return', optional($._expr), ';'),
    break_statement: $ => seq('break', optional($.identifier), ';'),
    continue_statement: $ => seq('continue', optional($.identifier), ';'),

    labeled_statement: $ => seq($.identifier, ':', $._stmt),

    // ── Type system ──

    type: $ => choice(
      $.basic_type,
      prec.left(seq($.type, '|', $.type)),
      $.id_type,
      $.typeof_type_expr,
    ),

    basic_type: $ => choice(
      'float', 'void', 'mixed', '__unknown__', 'auto',
      seq('string', optional($._string_width)),
      seq('int', optional($._int_range)),
      seq('mapping', optional($._mapping_type)),
      seq('function', optional($._function_type)),
      seq('object', optional($._program_type)),
      seq('program', optional($._program_type)),
      seq('array', optional($._array_type)),
      seq('multiset', optional($._multiset_type)),
      seq('__attribute__', '(', $.string_literal, ',', $.type, ')'),
      seq('__deprecated__', '(', $.type, ')'),
      seq('__experimental__', '(', $.type, ')'),
    ),

    _int_range: $ => seq('(', choice(
      seq(optional($.integer_literal), '..', optional($.integer_literal)),
      seq('bits', $.integer_literal),
    ), ')'),

    _string_width: $ => choice(
      $._int_range,
      seq('(', optional($._int_range), ':', optional($._int_range), ')'),
    ),

    _mapping_type: $ => seq('(', $.type, ':', $.type, ')'),

    _function_type: $ => seq('(', commaSep($.type), optional('...'), ':', $.type, ')'),

    _program_type: $ => choice(seq('(', $.type, ')'), seq('(', $.string_literal, ')')),

    _array_type: $ => choice(
      seq('(', $.type, ')'),
      seq('(', optional($._int_range), ':', $.type, ')'),
    ),

    _multiset_type: $ => seq('(', $.type, ')'),

    id_type: $ => $._id_expr,

    typeof_type_expr: $ => seq('typeof', '(', $._expr, ')'),

    _id_expr: $ => choice(
      $.identifier,
      seq($._id_expr, '.', $.identifier),
      $.scope_expr,
      seq('.', $.identifier),
      $.backtick_identifier,
    ),

    // ── Declarations ──

    declaration: $ => seq(
      repeat($.annotation),
      repeat($._modifier),
      choice(
        $.function_decl,
        $.variable_decl,
        $.constant_decl,
        $.class_decl,
        $.enum_decl,
        $.typedef_decl,
        $.import_decl,
        $.inherit_decl,
        $.static_assertion,
        $.block,
      ),
    ),

    _modifier: _ => choice(
      'private', 'protected', 'public', 'static', 'extern',
      'inline', 'local', 'final', 'variant', 'optional', 'global', 'nomask',
      '__generator__', '__async__',
    ),

    annotation: $ => seq('@', $._expr),

    function_decl: $ => seq(
      $.type, $.identifier,
      field('parameters', $.parameters),
      choice($.block, ';'),
    ),

    parameters: $ => seq('(', optional(commaSep1($.parameter)), ')'),

    parameter: $ => seq(
      $.type, optional('...'), $.identifier,
      optional(seq('=', $._expr)),
    ),

    variable_decl: $ => seq(
      $.type, commaSep1(seq($.identifier, optional(seq('=', $._expr)))),
      ';',
    ),

    local_declaration: $ => seq(
      $.type, commaSep1(seq($.identifier, optional(seq('=', $._expr)))),
      ';',
    ),

    constant_decl: $ => seq(
      'constant', optional($.type),
      commaSep1(seq($.identifier, '=', $._expr)),
      ';',
    ),

    class_decl: $ => seq(
      'class', $.identifier,
      optional($.generic_bindings),
      optional($.parameters),
      $.class_body,
    ),

    anon_class: $ => seq(
      'class',
      optional($.generic_bindings),
      optional($.parameters),
      $.class_body,
    ),

    class_body: $ => seq('{', repeat($.declaration), '}'),

    enum_decl: $ => seq(
      'enum', optional($.identifier),
      '{', optional(commaSep1($.enum_member)), '}',
    ),

    anon_enum: $ => seq(
      'enum', '{', optional(commaSep1($.enum_member)), '}',
    ),

    enum_member: $ => seq(
      repeat($.annotation), $.identifier,
      optional(seq('=', $._expr)),
    ),

    typedef_decl: $ => seq(
      repeat($._modifier), 'typedef', $.type, $.identifier, ';',
    ),

    import_decl: $ => seq(
      repeat($._modifier), 'import', choice($._expr, $.string_literal), ';',
    ),

    inherit_decl: $ => seq(
      repeat($._modifier), 'inherit', choice($._expr, $.string_literal),
      optional(seq(':', choice($.identifier, $.string_literal))),
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
