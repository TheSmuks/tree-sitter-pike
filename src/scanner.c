#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"

#include <string.h>

// ── External token symbol ───────────────────────────────────────────────
// Must match the order declared in grammar.ts externals array.
//
// NOTE: PREPROC_BLOCK was in the original design (docs/scanner-design.md)
// but was found to be incompatible with the transparent extras approach
// for conditional directives. See Section 10 (Post-Design Analysis) in
// the design doc for details. Only HASH_STRING is implemented.
enum TokenType {
    HASH_STRING,    // Pike #"..." multi-line string literal
};

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
