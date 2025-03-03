import React, { createElement, ReactNode } from 'react';

const createTags = <T extends string>(
  elements: T[],
): {
  [K in T]: (props: {
    children: ReactNode;
    suffix?: string;
  }) => React.JSX.Element;
} => {
  return elements.reduce(
    (acc, element) => {
      acc[element] = ({
        children,
        suffix,
      }: {
        children: ReactNode;
        suffix?: string;
      }) => {
        const elementName = suffix ? `${element}${suffix}` : element;
        return createElement(elementName, {}, children);
      };
      return acc;
    },
    {} as {
      [K in T]: (props: {
        children: ReactNode;
        suffix?: string;
      }) => React.JSX.Element;
    },
  );
};

const x = createTags([
  'knowledge',
  'question',
  'answer',
  'references',
  'attempt',
  'rejectReason',
  'actionsRecap',
  'actionsBlame',
  'badAttempts',
]);

const systemPrompt = (
  <>
    <>
      You are an advanced AI research agent from Jina AI. You are specialized in
      multistep reasoning. Using your training data and prior lessons learned,
      answer the user question with absolute certainty.
    </>
    <>
      You have successfully gathered some knowledge which might be useful for
      answering the original question. Here is the knowledge you have gathered
      so far:
    </>
    <x.knowledge>
      <x.knowledge suffix={`-${1}`}>
        <x.question>
          What does the internet say about "potential replacements for Ruben
          Amorim Manchester United manager"?
        </x.question>
        <x.answer>
          Manchester United have already identified Thomas Frank as Ruben
          Amorim's potential replacement, as per reports.; Reports claim Geovany
          Quenda and Morten Hjulmand could both follow Amorim to United this
          summer. United are 'advancing in talks' for wing-back ...
        </x.answer>
      </x.knowledge>
    </x.knowledge>
    <x.badAttempts>
      <x.attempt>
        <x.question>
          Who would be the best replacement for Ruben Amorim at United?
        </x.question>
        <x.answer>
          Based on current reports, Thomas Frank has been identified as a
          potential replacement for Ruben Amorim at Manchester United[^1]. He
          seems like a decent fit considering the reports. It's worth keeping in
          mind that managerial situations are always fluid, but Frank is a name
          that's been consistently linked.
        </x.answer>
        <x.rejectReason>
          The answer contains uncertainty markers like 'potential', 'seems
          like', 'worth keeping in mind', and 'consistently linked'. It doesn't
          definitively state who *will* be the replacement, acknowledging the
          fluidity of managerial situations.
        </x.rejectReason>
        <x.actionsRecap>
          I started by searching for managerial candidates who fit Manchester
          United's profile, focusing on risk vs. reward, tactical approach, and
          player development. I revisited URLs I'd already seen, then reflected
          on knowledge gaps, identifying sub-questions about Amorim's profile
          and potential replacements. I searched for managers with similar
          tactical styles and player development skills, visiting a tactical
          analysis of Amorim. I revisited URLs again and reflected on the same
          questions. Finally, I answered based on reports linking Thomas Frank
          to the job, but the answer was deemed too uncertain
        </x.actionsRecap>
        <x.actionsBlame>
          I reckon I bottled it by relying too much on reports and not enough on
          solid tactical analysis. I should've dug deeper into potential
          managers' actual styles and track records instead of just echoing
          what's in the news.
        </x.actionsBlame>
      </x.attempt>
    </x.badAttempts>
  </>
);

function stringifyJSX(jsx: ReactNode): string {
  if (typeof jsx === 'undefined' || (typeof jsx === 'object' && !jsx))
    return '';
  if (typeof jsx === 'object' && Symbol.iterator in jsx) {
    const children: string[] = [];
    for (const child of jsx) {
      children.push(stringifyJSX(child));
    }
    return children.join('\n');
  }

  if (typeof jsx === 'object' && 'then' in jsx) {
    return '';
  }

  if (
    typeof jsx === 'string' ||
    typeof jsx === 'number' ||
    typeof jsx === 'boolean'
  ) {
    return jsx.toString();
  }

  if (typeof jsx === 'object') {
    if (typeof jsx.type === 'function') {
      const tagName = jsx.type(jsx.props).type;

      return (
        `<${tagName}>` +
        '\n' +
        `${stringifyJSX(jsx.props.children)}` +
        '\n' +
        `</${tagName}>`
      );
    }
    return stringifyJSX(jsx.props.children);
  }

  // For components or more complex structures
  return '';
}

console.log(stringifyJSX(systemPrompt));
