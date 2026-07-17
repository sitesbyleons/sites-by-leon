import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import SelectedWorkReel from '../src/components/SelectedWorkReel';
import { demoPortfolio } from '../src/lib/content/demo';

const selectedWorkSourceUrl = new URL('../src/components/SelectedWorkReel.tsx', import.meta.url);

type MotionElementTarget = {
  tagName: string;
  identityAttribute?: string;
  identityValue?: string;
};

type JsxElementWithAttributes = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

const reelFrameTarget = { tagName: 'figure' } as const;
const imageDriftTarget = {
  tagName: 'div',
  identityAttribute: 'className',
  identityValue: 'work-project__image-drift',
} as const;
const projectTarget = {
  tagName: 'article',
  identityAttribute: 'className',
  identityValue: 'work-project',
} as const;
const selectedWorkHeadingTarget = {
  tagName: 'h2',
  identityAttribute: 'id',
  identityValue: 'selected-work-title',
} as const;

const parseSelectedWorkSource = (source: string) => ts.createSourceFile(
  'SelectedWorkReel.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

const findJsxAttribute = (element: JsxElementWithAttributes, name: string) => {
  const attributes = element.attributes.properties.filter(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute)
      && ts.isIdentifier(attribute.name)
      && attribute.name.text === name,
  );
  if (attributes.length > 1) throw new Error(`Expected at most one ${name} attribute`);
  return attributes[0];
};

const getJsxAttribute = (element: JsxElementWithAttributes, name: string) => {
  const attribute = findJsxAttribute(element, name);
  if (!attribute) throw new Error(`Expected one ${name} attribute`);
  return attribute;
};

const getStringAttributeValue = (element: JsxElementWithAttributes, name: string) => {
  const initializer = findJsxAttribute(element, name)?.initializer;
  return initializer && ts.isStringLiteral(initializer) ? initializer.text : undefined;
};

const getExpressionAttributeValue = (element: JsxElementWithAttributes, name: string) => {
  const initializer = getJsxAttribute(element, name).initializer;
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) {
    throw new Error(`Expected ${name} to contain an expression`);
  }
  return initializer.expression;
};

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const isMotionElement = (element: ts.JsxOpeningElement, tagName: string) =>
  ts.isPropertyAccessExpression(element.tagName)
  && ts.isIdentifier(element.tagName.expression)
  && element.tagName.expression.text === 'motion'
  && element.tagName.name.text === tagName;

const findMotionElement = (sourceFile: ts.SourceFile, target: MotionElementTarget) => {
  const matches: ts.JsxOpeningElement[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxOpeningElement(node)
      && isMotionElement(node, target.tagName)
      && (
        !target.identityAttribute
        || getStringAttributeValue(node, target.identityAttribute) === target.identityValue
      )
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (matches.length !== 1) throw new Error(`Expected one motion.${target.tagName} target`);
  return matches[0];
};

const getObjectAttributeValue = (element: JsxElementWithAttributes, name: string) => {
  const expression = unwrapExpression(getExpressionAttributeValue(element, name));
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(`Expected ${name} to contain an object literal`);
  }
  return expression;
};

const getObjectPropertyName = (property: ts.ObjectLiteralElementLike) => {
  if (ts.isSpreadAssignment(property)) return undefined;
  const { name } = property;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return undefined;
};

const findObjectProperties = (object: ts.ObjectLiteralExpression, name: string) =>
  object.properties.filter((property) => getObjectPropertyName(property) === name);

const getPropertyAssignment = (object: ts.ObjectLiteralExpression, name: string) => {
  const properties = findObjectProperties(object, name);
  if (properties.length !== 1 || !ts.isPropertyAssignment(properties[0])) {
    throw new Error(`Expected one ${name} property assignment`);
  }
  return properties[0];
};

const expectNoObjectProperty = (object: ts.ObjectLiteralExpression, name: string) => {
  expect(findObjectProperties(object, name)).toHaveLength(0);
};

const expectIdentifierProperty = (
  object: ts.ObjectLiteralExpression,
  name: string,
  identifier: string,
) => {
  const initializer = unwrapExpression(getPropertyAssignment(object, name).initializer);
  if (!ts.isIdentifier(initializer)) throw new Error(`Expected ${name} to be an identifier`);
  expect(initializer.text).toBe(identifier);
};

const expectNumberProperty = (
  object: ts.ObjectLiteralExpression,
  name: string,
  value: number,
) => {
  const initializer = unwrapExpression(getPropertyAssignment(object, name).initializer);
  if (!ts.isNumericLiteral(initializer)) throw new Error(`Expected ${name} to be numeric`);
  expect(Number(initializer.text)).toBe(value);
};

const expectBooleanProperty = (
  object: ts.ObjectLiteralExpression,
  name: string,
  value: boolean,
) => {
  const initializer = unwrapExpression(getPropertyAssignment(object, name).initializer);
  expect(initializer.kind).toBe(value ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword);
};

const expectStringArrayProperty = (
  object: ts.ObjectLiteralExpression,
  name: string,
  values: string[],
) => {
  const initializer = unwrapExpression(getPropertyAssignment(object, name).initializer);
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`Expected ${name} to be an array literal`);
  }
  const actualValues = initializer.elements.map((element) => {
    const value = unwrapExpression(element);
    if (!ts.isStringLiteralLike(value)) throw new Error(`Expected ${name} values to be strings`);
    return value.text;
  });
  expect(actualValues).toEqual(values);
};

const getViewportOnceInitializers = (sourceFile: ts.SourceFile) => {
  const initializers: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const viewport = findJsxAttribute(node, 'viewport');
      if (
        viewport?.initializer
        && ts.isJsxExpression(viewport.initializer)
        && viewport.initializer.expression
      ) {
        const expression = unwrapExpression(viewport.initializer.expression);
        if (ts.isObjectLiteralExpression(expression)) {
          for (const property of findObjectProperties(expression, 'once')) {
            if (ts.isPropertyAssignment(property)) {
              initializers.push(unwrapExpression(property.initializer));
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return initializers;
};

const insertQuotedStyleProperty = (
  source: string,
  target: MotionElementTarget,
  propertyName: string,
) => {
  const sourceFile = parseSelectedWorkSource(source);
  const style = getObjectAttributeValue(findMotionElement(sourceFile, target), 'style');
  const separator = style.properties.hasTrailingComma ? ' ' : ', ';
  const insertion = `${separator}${JSON.stringify(propertyName)}: 1`;
  return `${source.slice(0, style.properties.end)}${insertion}${source.slice(style.properties.end)}`;
};

const expectSelectedWorkMotionContracts = (source: string) => {
  const sourceFile = parseSelectedWorkSource(source);
  const frame = findMotionElement(sourceFile, reelFrameTarget);
  const imageDrift = findMotionElement(sourceFile, imageDriftTarget);
  const project = findMotionElement(sourceFile, projectTarget);
  const heading = findMotionElement(sourceFile, selectedWorkHeadingTarget);

  const imageStyle = getObjectAttributeValue(imageDrift, 'style');
  expectIdentifierProperty(imageStyle, 'transform', 'imageTransform');
  expectNoObjectProperty(imageStyle, 'y');

  const headingStyle = getObjectAttributeValue(heading, 'style');
  expectIdentifierProperty(headingStyle, 'transform', 'headingTransform');
  expectNoObjectProperty(headingStyle, 'x');

  const whileInView = unwrapExpression(getExpressionAttributeValue(project, 'whileInView'));
  if (!ts.isConditionalExpression(whileInView)) {
    throw new Error('Expected project whileInView to be conditional');
  }
  const reducedMotionCondition = unwrapExpression(whileInView.condition);
  if (!ts.isIdentifier(reducedMotionCondition) || reducedMotionCondition.text !== 'reducedMotion') {
    throw new Error('Expected reducedMotion to select the project entrance');
  }
  const projectEntrance = unwrapExpression(whileInView.whenFalse);
  if (!ts.isObjectLiteralExpression(projectEntrance)) {
    throw new Error('Expected a non-reduced project entrance object');
  }
  expectStringArrayProperty(projectEntrance, 'transform', [
    'translate3d(0, 36px, 0)',
    'translate3d(0, 0, 0)',
  ]);
  expectNoObjectProperty(projectEntrance, 'y');

  const frameViewport = getObjectAttributeValue(frame, 'viewport');
  expectNumberProperty(frameViewport, 'amount', 0.28);
  expectBooleanProperty(frameViewport, 'once', true);

  const projectViewport = getObjectAttributeValue(project, 'viewport');
  expectNumberProperty(projectViewport, 'amount', 0.08);
  expectBooleanProperty(projectViewport, 'once', true);

  const viewportOnceInitializers = getViewportOnceInitializers(sourceFile);
  expect(viewportOnceInitializers).toHaveLength(2);
  expect(
    viewportOnceInitializers.filter(({ kind }) => kind === ts.SyntaxKind.TrueKeyword),
  ).toHaveLength(2);
  expect(
    viewportOnceInitializers.filter(({ kind }) => kind === ts.SyntaxKind.FalseKeyword),
  ).toHaveLength(0);
};

const structuralPropertyMutations = [
  {
    name: 'quoted y property on image drift',
    target: imageDriftTarget,
    propertyName: 'y',
  },
  {
    name: 'quoted x property on selected work heading',
    target: selectedWorkHeadingTarget,
    propertyName: 'x',
  },
] as const;

describe('SelectedWorkReel', () => {
  it('turns a single featured gallery into a complete three-frame showcase', () => {
    const gallery = demoPortfolio.galleries[0];
    const html = renderToStaticMarkup(
      <SelectedWorkReel galleries={[gallery]} tone="editorial" />,
    );

    expect(html.match(/data-portfolio-item/g)).toHaveLength(1);
    expect(html).toContain('data-frame-count="3"');
    expect(html.match(/class="work-project__frame/g)).toHaveLength(3);
    expect(html).toContain('data-tone="editorial"');
    expect(html).toContain('data-motion-libraries="skiper-ui react-spring motion"');
    expect(html).toContain(`href="/work/${gallery.slug}"`);
    expect(html).toContain('1 project');
    expect(html).toContain('3 photographs');
  });

  it('parses the selected work motion contracts from the TSX AST', async () => {
    const source = await readFile(selectedWorkSourceUrl, 'utf8');

    expectSelectedWorkMotionContracts(source);
  });

  it.each(structuralPropertyMutations)(
    'rejects a $name regression',
    async ({ target, propertyName }) => {
      const source = await readFile(selectedWorkSourceUrl, 'utf8');
      const mutatedSource = insertQuotedStyleProperty(source, target, propertyName);

      expect(() => expectSelectedWorkMotionContracts(mutatedSource)).toThrow();
    },
  );
});
