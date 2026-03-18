import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { User } from '../entities';
import { UserSearchResultDto } from './dto/user-search-result.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async search(query: string, requesterId: string): Promise<UserSearchResultDto[]> {
    // Input validated at controller level by UserSearchQueryDto (@MinLength(2))
    const q = query.trim();
    const users = await this.userRepo.find({
      where: [
        { username: ILike(`%${q}%`), id: Not(requesterId) },
        { email: ILike(`%${q}%`), id: Not(requesterId) },
        { phone: ILike(`%${q}%`), id: Not(requesterId) },
      ],
      select: ['id', 'username', 'email', 'phone'],
      take: 20,
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      phone: u.phone,
    }));
  }
}
