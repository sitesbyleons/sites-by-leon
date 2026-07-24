import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import SelectedWorkReel from '../src/components/SelectedWorkReel';
import { demoPortfolio } from '../src/lib/content/demo';

const selectedWorkSourceUrl = new URL('../src/components/SelectedWorkReel.tsx', import.meta.url);
const selectedWorkStylesUrl = new URL('../src/components/selected-work-reel.css', import.meta.url);

type MotionElementTarget = {
  tagName: string;
  identityAttribute?: string;
  identityValue?: string;
};

type JsxElementWithAttributes = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

type ContractedObjectTarget =
  | {
      kind: 'attribute';
      element: MotionElementTarget;
      attribute: string;
    }
  | { kind: 'projectEntrance' };

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

const imageStyleTarget = {
  kind: 'attribute',
  element: imageDriftTarget,
  attribute: 'style',
} as const;
const headingStyleTarget = {
  kind: 'attribute',
  element: selectedWorkHeadingTarget,
  attribute: 'style',
} as const;
const projectEntranceTarget = { kind: 'projectEntrance' } as const;
const frameViewportTarget = {
  kind: 'attribute',
  element: reelFrameTarget,
  attribute: 'viewport',
} as const;
const projectViewportTarget = {
  kind: 'attribute',
  element: projectTarget,
  attribute: 'viewport',
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

const expectNoJsxSpreadAttributes = (
  element: JsxElementWithAttributes,
  label: string,
) => {
  const spreadAttributes = element.attributes.properties.filter(ts.isJsxSpreadAttribute);
  if (spreadAttributes.length > 0) {
    throw new Error(`${label} must not contain JSX spread attributes`);
  }
};

const findMotionElement = (sourceFile: ts.SourceFile, target: MotionElementTarget) => {
  const matches: ts.JsxOpeningElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && isMotionElement(node, target.tagName)) {
      if (
        !target.identityAttribute
        || getStringAttributeValue(node, target.identityAttribute) === target.identityValue
      ) {
        expectNoJsxSpreadAttributes(node, `motion.${target.tagName}`);
        matches.push(node);
      }
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

const getProjectEntrance = (project: ts.JsxOpeningElement) => {
  const whileInView = unwrapExpression(getExpressionAttributeValue(project, 'whileInView'));
  if (!ts.isConditionalExpression(whileInView)) {
    throw new Error('Expected project whileInView to be conditional');
  }
  const reducedMotionCondition = unwrapExpression(whileInView.condition);
  if (!ts.isIdentifier(reducedMotionCondition) || reducedMotionCondition.text !== 'reducedMotion') {
    throw new Error('Expected reducedMotion to select the project entrance');
  }
  const entrance = unwrapExpression(whileInView.whenFalse);
  if (!ts.isObjectLiteralExpression(entrance)) {
    throw new Error('Expected a non-reduced project entrance object');
  }
  return entrance;
};

const getContractedObject = (
  sourceFile: ts.SourceFile,
  target: ContractedObjectTarget,
) => target.kind === 'projectEntrance'
  ? getProjectEntrance(findMotionElement(sourceFile, projectTarget))
  : getObjectAttributeValue(findMotionElement(sourceFile, target.element), target.attribute);

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

const expectStaticObjectMembers = (
  object: ts.ObjectLiteralExpression,
  label: string,
) => {
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      throw new Error(`${label} must not contain spread assignments`);
    }
    if (getObjectPropertyName(property) === undefined) {
      throw new Error(`${label} contains an unresolved property name`);
    }
  }
};

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

const insertObjectMember = (
  source: string,
  target: ContractedObjectTarget,
  member: string,
) => {
  const sourceFile = parseSelectedWorkSource(source);
  const object = getContractedObject(sourceFile, target);
  const separator = object.properties.hasTrailingComma ? ' ' : ', ';
  return `${source.slice(0, object.properties.end)}${separator}${member}${source.slice(object.properties.end)}`;
};

const insertJsxSpreadAttribute = (
  source: string,
  target: MotionElementTarget,
  expression: string,
) => {
  const sourceFile = parseSelectedWorkSource(source);
  const element = findMotionElement(sourceFile, target);
  const position = element.attributes.properties.end;
  return `${source.slice(0, position)} {...${expression}}${source.slice(position)}`;
};

const expectSelectedWorkMotionContracts = (source: string) => {
  const sourceFile = parseSelectedWorkSource(source);
  const frame = findMotionElement(sourceFile, reelFrameTarget);
  const imageDrift = findMotionElement(sourceFile, imageDriftTarget);
  const project = findMotionElement(sourceFile, projectTarget);
  const heading = findMotionElement(sourceFile, selectedWorkHeadingTarget);

  const imageStyle = getObjectAttributeValue(imageDrift, 'style');
  expectStaticObjectMembers(imageStyle, 'Image drift style');
  expectIdentifierProperty(imageStyle, 'transform', 'imageTransform');
  expectNoObjectProperty(imageStyle, 'y');

  const headingStyle = getObjectAttributeValue(heading, 'style');
  expectStaticObjectMembers(headingStyle, 'Selected work heading style');
  expectIdentifierProperty(headingStyle, 'transform', 'headingTransform');
  expectNoObjectProperty(headingStyle, 'x');

  const projectEntrance = getProjectEntrance(project);
  expectStaticObjectMembers(projectEntrance, 'Project entrance');
  expectStringArrayProperty(projectEntrance, 'transform', [
    'translate3d(0, 36px, 0)',
    'translate3d(0, 0, 0)',
  ]);
  expectNoObjectProperty(projectEntrance, 'y');

  const frameViewport = getObjectAttributeValue(frame, 'viewport');
  expectStaticObjectMembers(frameViewport, 'Reel frame viewport');
  expectNumberProperty(frameViewport, 'amount', 0.28);
  expectBooleanProperty(frameViewport, 'once', true);

  const projectViewport = getObjectAttributeValue(project, 'viewport');
  expectStaticObjectMembers(projectViewport, 'Project viewport');
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
    target: imageStyleTarget,
    member: '"y": 1',
  },
  {
    name: 'quoted x property on selected work heading',
    target: headingStyleTarget,
    member: '"x": 1',
  },
  {
    name: 'image style spread with y and transform overrides',
    target: imageStyleTarget,
    member: '...{ y: 1, transform: headingTransform }',
  },
  {
    name: 'heading style spread with x and transform overrides',
    target: headingStyleTarget,
    member: '...{ x: 1, transform: imageTransform }',
  },
  {
    name: 'project entrance spread with y and transform overrides',
    target: projectEntranceTarget,
    member: "...{ y: [36, 0], transform: ['translate3d(0, 99px, 0)', 'translate3d(0, 1px, 0)'] }",
  },
  {
    name: 'frame viewport spread with once false',
    target: frameViewportTarget,
    member: '...{ once: false }',
  },
  {
    name: 'project viewport spread with once false',
    target: projectViewportTarget,
    member: '...{ once: false }',
  },
  {
    name: 'unresolved computed image style property',
    target: imageStyleTarget,
    member: '[unresolvedMotionKey]: 1',
  },
] as const;

const jsxSpreadMutations = [
  {
    name: 'image style JSX spread override',
    target: imageDriftTarget,
    expression: '{ style: { transform: headingTransform, y: 1 } }',
  },
  {
    name: 'heading style JSX spread override',
    target: selectedWorkHeadingTarget,
    expression: '{ style: { transform: imageTransform, x: 1 } }',
  },
  {
    name: 'project whileInView JSX spread override',
    target: projectTarget,
    expression: "{ whileInView: { y: [36, 0], transform: ['translate3d(0, 99px, 0)'] } }",
  },
  {
    name: 'frame viewport JSX spread override',
    target: reelFrameTarget,
    expression: '{ viewport: { amount: 0.28, once: false } }',
  },
  {
    name: 'project viewport JSX spread override',
    target: projectTarget,
    expression: '{ viewport: { amount: 0.08, once: false } }',
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
    expect(html).toContain('data-motion-libraries="skiper-ui motion"');
    expect(html).not.toContain('work-project__light');
    expect(html).toContain(`href="/work/${gallery.slug}"`);
    expect(html).toContain('1 project');
    expect(html).toContain('3 photographs');
  });

  it('parses the selected work motion contracts from the TSX AST', async () => {
    const source = await readFile(selectedWorkSourceUrl, 'utf8');

    expectSelectedWorkMotionContracts(source);
  });

  it('keeps the shared portfolio surface clean and tenant-led', async () => {
    const [source, styles] = await Promise.all([
      readFile(selectedWorkSourceUrl, 'utf8'),
      readFile(selectedWorkStylesUrl, 'utf8'),
    ]);

    expect(styles).toContain('--reel-paper: var(--paper)');
    expect(styles).toContain('background: var(--reel-paper)');
    expect(styles).not.toMatch(/\.work-reel::(?:before|after)/);
    expect(styles).not.toMatch(/(?:linear|radial)-gradient/);
    expect(styles).not.toContain('clip-path: polygon');
    expect(source).not.toContain('work-project__light');
    expect(source).not.toContain('@react-spring/web');
  });

  it.each(structuralPropertyMutations)(
    'rejects a $name regression',
    async ({ target, member }) => {
      const source = await readFile(selectedWorkSourceUrl, 'utf8');
      const mutatedSource = insertObjectMember(source, target, member);

      expect(() => expectSelectedWorkMotionContracts(mutatedSource)).toThrow();
    },
  );

  it.each(jsxSpreadMutations)(
    'rejects a $name regression',
    async ({ target, expression }) => {
      const source = await readFile(selectedWorkSourceUrl, 'utf8');
      const mutatedSource = insertJsxSpreadAttribute(source, target, expression);

      expect(() => expectSelectedWorkMotionContracts(mutatedSource)).toThrow();
    },
  );
});
