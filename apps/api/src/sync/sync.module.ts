import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { InboxSignalInterceptor } from './inbox-signal.interceptor';

/**
 * Inbox change-signalling. No entities of its own — the service reads
 * `MAX(updated_at)` straight off the four tables that own the events, so there
 * is no state here to keep in sync with them.
 */
@Module({
  controllers: [SyncController],
  providers: [
    SyncService,
    // Registered here rather than in AppModule: APP_INTERCEPTOR from a feature
    // module is still global, but resolves SyncService from this module's
    // injector instead of forcing it into the root provider list.
    { provide: APP_INTERCEPTOR, useClass: InboxSignalInterceptor },
  ],
  exports: [SyncService],
})
export class SyncModule {}
