import { z } from 'zod';
import { SchemaType, ProviderType, OpenAIFunctionParameter } from '../types';
import type { SchemaProperty } from '../types';

export function convertToZodType(prop: SchemaProperty): z.ZodTypeAny {
  let zodType: z.ZodTypeAny;
  switch (prop.type) {
    case SchemaType.STRING:
      zodType = z.string().describe(prop.description || '');
      break;
    case SchemaType.BOOLEAN:
      zodType = z.boolean().describe(prop.description || '');
      break;
    case SchemaType.ARRAY:
      if (!prop.items) throw new Error('Array schema must have items defined');
      zodType = z.array(convertToZodType(prop.items))
        .describe(prop.description || '')
        .max(prop.maxItems || Infinity);
      break;
    case SchemaType.OBJECT: {
      if (!prop.properties) throw new Error('Object schema must have properties defined');
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, value] of Object.entries(prop.properties)) {
        shape[key] = convertToZodType(value);
      }
      zodType = z.object(shape).describe(prop.description || '');
      break;
    }
    default:
      throw new Error(`Unsupported schema type: ${prop.type}`);
  }
  return zodType;
}

export function convertToGeminiSchema(schema: z.ZodSchema): SchemaProperty {
  // Initialize schema properties
  let type: SchemaType;
  let properties: Record<string, SchemaProperty> | undefined;
  let items: SchemaProperty | undefined;
  let description = '';

  if (schema instanceof z.ZodString) {
    type = SchemaType.STRING;
    description = schema.description || '';
  } else if (schema instanceof z.ZodBoolean) {
    type = SchemaType.BOOLEAN;
    description = schema.description || '';
  } else if (schema instanceof z.ZodArray) {
    type = SchemaType.ARRAY;
    description = schema.description || '';
    items = convertToGeminiSchema(schema.element);
  } else if (schema instanceof z.ZodObject) {
    type = SchemaType.OBJECT;
    description = schema.description || '';
    properties = {};
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convertToGeminiSchema(value as z.ZodSchema);
    }
  } else {
    throw new Error('Unsupported Zod type');
  }

  return {
    type,
    description,
    ...(properties && { properties }),
    ...(items && { items })
  };
}

export function convertToOpenAIFunctionSchema(schema: z.ZodSchema): OpenAIFunctionParameter {
  if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description || '' };
  } else if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description || '' };
  } else if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      description: schema.description || '',
      items: convertToOpenAIFunctionSchema(schema.element),
      ...(schema._def.maxLength && { maxItems: schema._def.maxLength.value })
    };
  } else if (schema instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    
    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodTypeAny;
      properties[key] = convertToOpenAIFunctionSchema(zodValue);
      if (!zodValue.isOptional?.()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      description: schema.description || '',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }
  
  throw new Error('Unsupported Zod type');
}

export function getProviderSchema(provider: ProviderType, schema: z.ZodSchema): SchemaProperty | OpenAIFunctionParameter {
  switch (provider) {
    case 'gemini':
      return convertToGeminiSchema(schema);
    case 'openai':
    case 'ollama': {
      const functionSchema = convertToOpenAIFunctionSchema(schema);
      return {
        type: 'object',
        properties: functionSchema.properties,
        required: functionSchema.required
      };
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
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
