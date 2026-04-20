
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Permet au frontend React de communiquer avec l'API
  await app.listen(3000);
  console.log('Serveur NestJS AxiaFlex lancé sur http://localhost:3000');
}
bootstrap();
