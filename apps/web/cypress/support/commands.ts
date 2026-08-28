// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// 自定义登录命令
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/login');
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/dashboard');
});

// 自定义登出命令
Cypress.Commands.add('logout', () => {
  cy.get('[data-testid="user-menu"]').click();
  cy.get('[data-testid="logout-button"]').click();
  cy.url().should('include', '/login');
});

// 自定义创建 Skill 命令
Cypress.Commands.add('createSkill', (skillData: {
  name: string;
  slug: string;
  description?: string;
  category?: string;
}) => {
  cy.visit('/skills/new');
  cy.get('input[name="name"]').type(skillData.name);
  cy.get('input[name="slug"]').type(skillData.slug);
  if (skillData.description) {
    cy.get('textarea[name="description"]').type(skillData.description);
  }
  if (skillData.category) {
    cy.get('select[name="category"]').select(skillData.category);
  }
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/skills/');
});

// 声明自定义命令的类型
declare global {
   
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      logout(): Chainable<void>;
      createSkill(skillData: {
        name: string;
        slug: string;
        description?: string;
        category?: string;
      }): Chainable<void>;
    }
  }
}

export {};