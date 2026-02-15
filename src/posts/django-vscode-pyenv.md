---
title: "Django + VS Code + pyenv: fluxo estável para múltiplos projetos Python"
date: "2026-02-14"
category: "Backend"
summary: "Como organizar ambiente backend com Django e Python sem conflitos de versão."
readingTime: "11 min"
tags:
  - Django
  - Python
  - VS Code
  - Backend
coverImage: "/assets/images/vscode-news.svg"
---

Para backend em Python, a combinação que melhor funcionou para mim foi **Django + VS Code + pyenv + virtualenv**.

Ela resolve um problema central: manter vários projetos com versões diferentes do Python sem quebrar ambiente.

## 1. Django para previsibilidade de engenharia

O Django é um framework web de alto nível escrito em Python, criado com o objetivo de permitir o desenvolvimento rápido e seguro de aplicações web robustas. Ele segue o princípio “_batteries included_”, ou seja, já vem com diversas funcionalidades prontas para uso, como sistema de autenticação, painel administrativo automático, ORM (Object-Relational Mapper) e proteção contra vulnerabilidades comuns. Seu foco está na produtividade do desenvolvedor e na organização do código por meio do padrão arquitetural MVT (Model-View-Template), semelhante ao MVC.

Entre os principais benefícios do Django estão a rapidez no desenvolvimento, a segurança e a escalabilidade. O framework oferece proteções nativas contra ataques como CSRF, XSS e SQL Injection, reduzindo riscos de segurança. Além disso, seu ORM facilita a interação com bancos de dados de forma segura, abstraindo comandos SQL complexos. A comunidade é ativa e a vasta documentação oficial tornam o aprendizado e a manutenção mais acessíveis.

O Django também é escalável, sendo capaz de suportar aplicações que começam pequenas e crescem para milhões de usuários. Sua arquitetura modular permite organizar projetos grandes de forma clara e sustentável ao longo do tempo. A possibilidade de reutilização de aplicações (apps), integração com APIs REST (especialmente com Django REST Framework) e compatibilidade com diversos bancos de dados tornam o framework extremamente versátil para diferentes tipos de projetos.

Grandes empresas adotam o Django em seus sistemas. Entre os exemplos estão o **Instagram**, que utiliza Django como parte essencial de sua infraestrutura, além de empresas como **Mozilla, Pinterest e Dropbox**, que já utilizaram ou utilizam o framework em diferentes contextos. Startups também optam pelo Django por permitir validar produtos rapidamente sem abrir mão de qualidade, tornando-o uma escolha estratégica tanto para projetos iniciantes quanto para plataformas consolidadas.

## 2. VS Code como cockpit de desenvolvimento

Com terminal, debugger, Git e análise estática no mesmo ambiente, o fluxo fica rápido e consistente.

Extensões que considero essenciais:

- Python
- Pylance
- Ferramenta de lint
- Ferramenta de formatação

## 3. pyenv para controle de versão real

Cada projeto pode declarar sua própria versão com `.python-version`.

### 3.1 Instalar o pyenv:

```
 curl https://pyenv.run | bash

 sudo apt install libedit-dev

 sudo apt-get install -y make build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev wget curl llvm libncurses5-dev libncursesw5-dev xz-utils tk-dev
```

### 3.2 Criar entradas abaixo em ~/.bashrc (Linux):

```
export PYENV_ROOT="$HOME/.pyenv"

export PATH="$PYENV_ROOT/bin:$PATH"

eval "$(pyenv init --path)"

eval "$(pyenv init -)"

eval "$(pyenv virtualenv-init -)"
```

### 3.3. Reinicie seu bash. 
   
### 3.4. Crie um ambiente virtual (exemplo: dei um nome _estudos_ usando python 3.8.10)

```
pyenv install 3.8.10

pyenv virtualenv 3.8.10 estudos

pyenv activate estudos
```

### 3.5. Verificar pré-condições, binários Linux que devem estar instalados:

```
sudo apt-get install lzma
sudo apt-get install liblzma-dev
sudo apt-get install libbz2-dev
sudo apt-get install m2crypto swig
```

### 3.6. Instalar as dependências (requirements)

```
pip install -r requirements.txt
```

Se der problema como: no space left on device, rode o comando da seguinte forma (alternativa)

```
TMPDIR=/var/tmp pip install -r requirements.txt
```

Referência deste projeto: 

https://github.com/pyenv/pyenv-virtualenv

Referência do erro (no space left on device):

https://github.com/pypa/pip/issues/7745


## 4. Virtualenv dedicado por repositório

Ambiente isolado por projeto evita acoplamento acidental de dependências globais.

Sempre mantenha dependências explicitadas em `requirements.txt` (ou equivalente).

## 5. Referência

Encontrei um bom site de referência na própria Microsoft. [Visite o artigo da Microsoft](https://code.visualstudio.com/docs/python/tutorial-django)

## Conclusão

Esse setup aumenta confiabilidade de build, reduz erros de ambiente e melhora ritmo de evolução no backend.
