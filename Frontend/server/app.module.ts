
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { User } from './entities/user.entity';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/variant.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Zone } from './entities/zone.entity';
import { TableConfig } from './entities/table.entity';
import { PosSession } from './entities/session.entity';
import { Client } from './entities/client.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'axiaflex',
      entities: [
        User, Category, Product, ProductVariant, 
        Order, OrderItem, Zone, TableConfig, 
        PosSession, Client
      ],
      synchronize: true, // Auto-create tables (turn off in production)
    }),
    TypeOrmModule.forFeature([
      User, Category, Product, ProductVariant, 
      Order, OrderItem, Zone, TableConfig, 
      PosSession, Client
    ]),
  ],
  controllers: [PosController],
  providers: [PosService],
})
export class AppModule {}
