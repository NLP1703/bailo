import { Module } from '@nestjs/common';
import { AdminAccountController } from './admin-account.controller';
import { AdminAccountService } from './admin-account.service';

@Module({
  controllers: [AdminAccountController],
  providers: [AdminAccountService],
})
export class AdminAccountModule {}
