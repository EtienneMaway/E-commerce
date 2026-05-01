import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PairMiniEmployeeDto {
  @ApiProperty({ example: 'mini_alice_a1b2c3', description: 'Username shown to the employer when the mini employee was created' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'A2B3C4D5E6', description: 'One-time pairing code shown to the employer at creation' })
  @IsString()
  @IsNotEmpty()
  pairingCode: string;
}
