import type {
  Collection,
  CollectionImport,
  SavedRequest,
  SavedRequestInput,
} from '@api-sentinel/shared';
import { AppError } from '../errors/AppError';
import type { CollectionRepository } from '../repositories/collectionRepository';

export interface ServiceClock {
  now(): string;
  newId(): string;
}

const systemClock: ServiceClock = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
};

/** Upper bound so a script cannot fill the disk with collections. */
export const MAX_COLLECTIONS = 500;
export const MAX_REQUESTS_PER_COLLECTION = 500;

/**
 * Business rules for collections (no SQL, no HTTP): existence checks, limits
 * and timestamps. The clock is injectable so tests get stable ids and times.
 */
export function createCollectionService(
  repo: CollectionRepository,
  clock: ServiceClock = systemClock,
) {
  const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found.`, 404);

  function requireCollection(id: string): Collection {
    const collection = repo.getCollection(id);
    if (!collection) throw notFound('Collection');
    return collection;
  }

  function assertRoomFor(collectionId: string, excludeId?: string) {
    const { requests } = requireCollection(collectionId);
    const count = requests.filter((r) => r.id !== excludeId).length;
    if (count >= MAX_REQUESTS_PER_COLLECTION) {
      throw new AppError(
        'VALIDATION_ERROR',
        `A collection can hold at most ${MAX_REQUESTS_PER_COLLECTION} requests.`,
        400,
      );
    }
  }

  return {
    list: (): Collection[] => repo.listCollections(),

    create(name: string): Collection {
      if (repo.listCollections().length >= MAX_COLLECTIONS) {
        throw new AppError(
          'VALIDATION_ERROR',
          `At most ${MAX_COLLECTIONS} collections are allowed.`,
          400,
        );
      }
      const id = clock.newId();
      repo.insertCollection(id, name, clock.now());
      return requireCollection(id);
    },

    rename(id: string, name: string): Collection {
      if (!repo.renameCollection(id, name, clock.now())) throw notFound('Collection');
      return requireCollection(id);
    },

    /** Creates a collection with its requests, in the given order, or nothing at all. */
    importCollection(input: CollectionImport): Collection {
      if (repo.listCollections().length >= MAX_COLLECTIONS) {
        throw new AppError(
          'VALIDATION_ERROR',
          `At most ${MAX_COLLECTIONS} collections are allowed.`,
          400,
        );
      }
      const id = clock.newId();
      const now = clock.now();
      repo.transaction(() => {
        repo.insertCollection(id, input.name, now);
        input.requests.forEach((request, index) => {
          repo.insertSavedRequest(
            clock.newId(),
            { ...request, collectionId: id, position: index + 1 },
            now,
          );
        });
      });
      return requireCollection(id);
    },

    remove(id: string): void {
      if (!repo.deleteCollection(id)) throw notFound('Collection');
    },

    getRequest(id: string): SavedRequest {
      const saved = repo.getSavedRequest(id);
      if (!saved) throw notFound('Saved request');
      return saved;
    },

    createRequest(input: SavedRequestInput): SavedRequest {
      assertRoomFor(input.collectionId);
      const id = clock.newId();
      repo.insertSavedRequest(id, input, clock.now());
      return this.getRequest(id);
    },

    /** Full replace; may also move the request to another collection. */
    updateRequest(id: string, input: SavedRequestInput): SavedRequest {
      this.getRequest(id); // 404 before checking the target collection
      assertRoomFor(input.collectionId, id);
      repo.updateSavedRequest(id, input, clock.now());
      return this.getRequest(id);
    },

    /** Changes only the name, so unsaved editor content can never overwrite the stored request. */
    renameRequest(id: string, name: string): SavedRequest {
      if (!repo.renameSavedRequest(id, name, clock.now())) throw notFound('Saved request');
      return this.getRequest(id);
    },

    removeRequest(id: string): void {
      if (!repo.deleteSavedRequest(id)) throw notFound('Saved request');
    },
  };
}

export type CollectionService = ReturnType<typeof createCollectionService>;
