import ts from 'typescript';
export function fieldBindingViolations(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
    violations = [];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Field') {
      const children = node.children.filter((child) => !ts.isJsxText(child) || child.text.trim());
      const expression =
        children.length === 1 && ts.isJsxExpression(children[0])
          ? children[0].expression
          : undefined;
      const parameter =
        expression && ts.isArrowFunction(expression) ? expression.parameters[0]?.name : undefined;
      let forwarded = false;
      if (parameter && ts.isIdentifier(parameter)) {
        function scan(n) {
          if (
            ts.isJsxSpreadAttribute(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === parameter.text
          )
            forwarded = true;
          ts.forEachChild(n, scan);
        }
        scan(expression.body);
      }
      if (!forwarded)
        violations.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          rule: 'field-control-binding',
        });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return violations;
}
