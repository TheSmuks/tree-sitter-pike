#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"

#include <string.h>

// ── External token symbol ───────────────────────────────────────────────
// Must match the order declared in grammar.ts externals array.
//
// NOTE: PREPROC_BLOCK was in the original design (docs/scanner-design.md)
// but was found to be incompatible with the transparent extras approach
// for conditional directives. See Section 10 (Post-Design Analysis) in
// the design doc for details.
enum TokenType {
    HASH_STRING,             // Pike #"..." multi-line string literal
    PREPROC_PARAMS_OPEN,     // '(' abutting a #define name (no space between)
    PREPROC_CHUNK,           // run of #define body text that is not a literal
    PREPROC_LINE_END,        // zero-width marker at the end of a #define
    PREPROC_ERROR_SENTINEL,  // never in the grammar; true only while recovering
};

// Characters a #define body hands back to the LR lexer instead of absorbing
// into a chunk, because a real rule tokenizes them better: identifiers and
// keywords, numbers, string and character literals, backtick operator names,
// and '/', which is both division and the start of every comment. A backslash
// is here so that a chunk stops before a line continuation; the continuation
// itself is consumed by skip_preproc_space, never delegated.
//
// Everything else — parens, commas, braces, operators, '#' and '##' — becomes
// chunk text. Bytes >= 0x80 are chunked rather than delegated: a non-ASCII
// letter would start an identifier, but any other non-ASCII byte would have no
// valid token at all, and an ERROR node costs more than a missed identifier.
static bool preproc_delegates(int32_t c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' ||
           (c >= '0' && c <= '9') || c == '"' || c == '\'' || c == '/' ||
           c == '\\' || c == '`';
}

// Advance past inter-token space, returning true if any horizontal space was
// crossed. Line continuations are consumed here rather than left to the
// whitespace `extra` because tree-sitter skips anonymous extras inside the
// generated lexer: once this scanner declines a position, it is not consulted
// again until after the next real token, so a body token following a spliced
// line would never reach it. A continuation deliberately does not count as
// space — splicing `F\<newline>(X)` yields the function-like `F(X)`.
static bool skip_preproc_space(TSLexer *lexer) {
    bool skipped_space = false;
    for (;;) {
        if (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
            lexer->advance(lexer, true);
            skipped_space = true;
            continue;
        }
        if (lexer->lookahead == '\\') {
            // A backslash that is not a continuation is invalid outside a
            // string anyway; dropping it keeps the body free of ERROR nodes.
            lexer->advance(lexer, true);
            if (lexer->lookahead == '\r') lexer->advance(lexer, true);
            if (lexer->lookahead == '\n') lexer->advance(lexer, true);
            continue;
        }
        return skipped_space;
    }
}

// The #define body: a token sequence terminated by the end of the logical line.
static bool scan_preproc(TSLexer *lexer, const bool *valid_symbols) {
    bool skipped_space = skip_preproc_space(lexer);

    if (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
        if (!valid_symbols[PREPROC_LINE_END]) return false;
        // Zero-width: the newline stays outside the directive so a #define
        // node ends exactly at its last body token, and the ordinary
        // whitespace extra consumes the newline as it always did.
        lexer->mark_end(lexer);
        lexer->result_symbol = PREPROC_LINE_END;
        return true;
    }

    if (valid_symbols[PREPROC_PARAMS_OPEN] && !skipped_space &&
        lexer->lookahead == '(') {
        lexer->advance(lexer, false);
        lexer->mark_end(lexer);
        lexer->result_symbol = PREPROC_PARAMS_OPEN;
        return true;
    }

    if (!valid_symbols[PREPROC_CHUNK]) return false;
    if (preproc_delegates(lexer->lookahead)) return false;

    while (!lexer->eof(lexer) && lexer->lookahead != '\n' &&
           lexer->lookahead != '\r' && lexer->lookahead != ' ' &&
           lexer->lookahead != '\t' && !preproc_delegates(lexer->lookahead)) {
        lexer->advance(lexer, false);
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = PREPROC_CHUNK;
    return true;
}

// ── Tree-sitter entry points ────────────────────────────────────────────

void *tree_sitter_pike_external_scanner_create(void) {
    // No state needed for hash-string-only scanner
    return ts_calloc(1, 1);
}

void tree_sitter_pike_external_scanner_destroy(void *payload) {
    ts_free(payload);
}

bool tree_sitter_pike_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols) {
    (void)payload;

    // The #define tokens are position-sensitive, so honouring them while
    // tree-sitter is guessing would let a macro body swallow arbitrary source.
    if (!valid_symbols[PREPROC_ERROR_SENTINEL] &&
        (valid_symbols[PREPROC_LINE_END] || valid_symbols[PREPROC_CHUNK] ||
         valid_symbols[PREPROC_PARAMS_OPEN])) {
        return scan_preproc(lexer, valid_symbols);
    }

    if (!valid_symbols[HASH_STRING]) return false;

    // Skip whitespace to find the '#'
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            lexer->advance(lexer, true);
        } else {
            break;
        }
    }

    if (lexer->eof(lexer)) return false;

    // Expect '#'
    if (lexer->lookahead != '#') return false;
    lexer->advance(lexer, false);

    // Pike accepts horizontal whitespace between '#' and '"' (e.g. `# "..."`),
    // which compiles identically to `#"..."`. Newlines are NOT allowed here —
    // a bare '#' on its own line is a preprocessor directive.
    while (!lexer->eof(lexer) &&
           (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
        lexer->advance(lexer, false);
    }

    // Must be followed by '"'
    if (lexer->eof(lexer) || lexer->lookahead != '"') return false;
    lexer->advance(lexer, false);

    // Scan string content: handle backslash escapes and literal newlines.
    // Hash-strings are multi-line — newlines are part of the content.
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        if (c == '"') {
            lexer->advance(lexer, false);
            lexer->mark_end(lexer);
            lexer->result_symbol = HASH_STRING;
            return true;
        }
        if (c == '\\') {
            lexer->advance(lexer, false);  // skip backslash
            if (!lexer->eof(lexer)) {
                lexer->advance(lexer, false);  // skip escaped char
            }
            continue;
        }
        lexer->advance(lexer, false);
    }

    // EOF inside hash-string — emit what we have (incomplete token)
    lexer->mark_end(lexer);
    lexer->result_symbol = HASH_STRING;
    return true;
}

unsigned tree_sitter_pike_external_scanner_serialize(void *payload, char *buffer) {
    (void)payload;
    (void)buffer;
    return 0;  // No state to serialize
}

void tree_sitter_pike_external_scanner_deserialize(void *payload, const char *buffer,
                                                     unsigned length) {
    (void)payload;
    (void)buffer;
    (void)length;
    // No state to deserialize
}
