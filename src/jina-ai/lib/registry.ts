import { container } from 'tsyringe';
import { propertyInjectorFactory } from 'civkit/property-injector';

export const InjectProperty = propertyInjectorFactory(container);