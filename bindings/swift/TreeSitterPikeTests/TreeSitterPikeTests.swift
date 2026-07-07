import XCTest
import SwiftTreeSitter
import TreeSitterPike

final class TreeSitterPikeTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_pike())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Pike grammar")
    }
}
