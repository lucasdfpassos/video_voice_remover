# Video Voice Remover - TODO

- [x] Schema de banco de dados (jobs table)
- [x] Instalar dependências Python (spleeter/librosa) via shell
- [x] Script Python de processamento de áudio (voice removal + mascaramento)
- [x] Endpoint Express para upload de vídeo (multipart/form-data, até 150MB)
- [x] Sistema de fila de jobs em memória com worker assíncrono
- [x] Rotas tRPC: uploadVideo, getJobStatus, downloadVideo, listJobs
- [x] Limpeza de metadados com ffmpeg
- [x] Re-codificação AAC 226kbps
- [x] Upload do vídeo processado para S3 com expiração 24h
- [x] Frontend: design system dark elegante (cores, tipografia, CSS vars)
- [x] Frontend: componente de upload drag-and-drop com validação 150MB
- [x] Frontend: lista de jobs com status em tempo real (polling)
- [x] Frontend: barra de progresso animada por etapa
- [x] Frontend: botão de download com URL pré-assinada
- [x] Frontend: feedback visual de cada etapa (fila → processando → concluído → erro)
- [x] Testes vitest para rotas principais
- [x] Checkpoint final
- [x] Correção: PYTHONHOME conflitando Python 3.13 com python3.11 no spawn do worker
