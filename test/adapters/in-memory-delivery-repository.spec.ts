import { InMemoryDeliveryRepository } from '../../src/adapters/memory/in-memory-delivery-repository';
import { describeDeliveryRepositoryContract } from '../support/delivery-repository-contract';

describeDeliveryRepositoryContract('InMemoryDeliveryRepository', () => new InMemoryDeliveryRepository());
