// ──────────────────────────────────────────────────────────────────────────────
// External scanner for tree-sitter-pike
//
// Handles context-sensitive tokens that the regex lexer cannot produce:
//
//   safe_arrow   `?->` — Pike's deprecated safe-index arrow (TOK_SAFE_INDEX).
//                 The `?` alone is the ternary operator; only when followed by
//                 `->` does it become a safe arrow.  The regex lexer splits
//                 `?` and `->` into separate tokens, so the ternary rule
//                 consumes `?` first, producing wrong parse trees for
//                 `conn?->session`.
//
// Recognised macro tokens (see macro_statement in grammar.ts):
//   No tokens here — macro_statement is handled purely in the grammar via
//   `IDENTIFIER(args) block IDENTIFIER ';'` pattern matching.
// ──────────────────────────────────────────────────────────────────────────────

#include "tree_sitter/parser.h"
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

void *tree_sitter_pike_external_scanner_create(void) { return NULL; }

void tree_sitter_pike_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_pike_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload; (void)buffer;
  return 0;
}

void tree_sitter_pike_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload; (void)buffer; (void)length;
}

// Skip whitespace and line continuations (backslash-newline) — mirrors the
// extras declared in the grammar so the scanner sees past them.
static void skip_whitespace_and_continuations(TSLexer *lexer) {
  for (;;) {
    if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
        lexer->lookahead == '\n' || lexer->lookahead == '\r') {
      lexer->advance(lexer, true);
      continue;
    }
    // Line continuation: backslash followed by newline
    if (lexer->lookahead == '\\') {
      lexer->mark_end(lexer);
      lexer->advance(lexer, false); // consume '\'
      if (lexer->lookahead == '\n' || lexer->lookahead == '\r') {
        lexer->advance(lexer, true); // skip newline as whitespace
        continue;
      }
      // Not a continuation — back up. The mark_end saved our position.
      // Unfortunately tree-sitter doesn't have a rewind; we return false
      // and the main lexer re-scans from the original position.
      return;
    }
    break;
  }
}

bool tree_sitter_pike_external_scanner_scan(
    void *payload,
    TSLexer *lexer,
    const bool *valid_symbols
) {
  (void)payload;

  // ── safe_arrow: `?->` ────────────────────────────────────────────────
  // Only attempt when the grammar expects a safe_arrow (declared as
  // external in grammar.ts) and the current character is `?`.
  if (valid_symbols[0] && lexer->lookahead == '?') {
    lexer->advance(lexer, false);  // consume '?'

    skip_whitespace_and_continuations(lexer);

    if (lexer->lookahead == '-') {
      lexer->advance(lexer, false);  // consume '-'
      if (lexer->lookahead == '>') {
        lexer->advance(lexer, false);  // consume '>'
        lexer->mark_end(lexer);
        lexer->result_symbol = 0;  // anon enum: safe_arrow = 0
        return true;
      }
    }
    // Not `?->` — don't consume anything; main lexer handles bare `?`.
    return false;
  }

  return false;
}

#ifdef __cplusplus
}
#endif
