import { z } from 'zod';
import { SchemaType } from '../types';
import type { SchemaProperty, ResponseSchema } from '../types';

export function convertToZodType(prop: SchemaProperty): z.ZodTypeAny {
  switch (prop.type) {
    case SchemaType.STRING:
      return z.string().describe(prop.description || '');
    case SchemaType.BOOLEAN:
      return z.boolean().describe(prop.description || '');
    case SchemaType.ARRAY:
      if (!prop.items) throw new Error('Array schema must have items defined');
      return z.array(convertToZodType(prop.items)).describe(prop.description || '');
    case SchemaType.OBJECT:
      if (!prop.properties) throw new Error('Object schema must have properties defined');
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, value] of Object.entries(prop.properties)) {
        shape[key] = convertToZodType(value);
      }
      return z.object(shape).describe(prop.description || '');
    default:
      throw new Error(`Unsupported schema type: ${prop.type}`);
  }
}

export function createZodSchema(schema: ResponseSchema): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    shape[key] = convertToZodType(prop);
  }
  return z.object(shape);
}

export function createPromptConfig(temperature: number = 0) {
  return {
    temperature,
    max_tokens: 1000,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
  };
}
